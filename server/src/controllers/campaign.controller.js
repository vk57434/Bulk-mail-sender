const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const fs = require('fs/promises');
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const { validateRecipientsFromCsv, importRecipientsFromCsv } = require('../services/recipient.service');
const { queuePendingRecipients, recalculateCampaignCounters, getCampaignAccountStats } = require('../services/campaign.service');
const logger = require('../utils/logger');
const { generateUnsubscribeToken } = require('../utils/template');
const config = require('../config/env');

function ensureCampaignOwnership(campaign, req) {
  if (!campaign) return false;
  if (!campaign.userId) return true;
  return String(campaign.userId) === String(req.user._id);
}

const EmailAccount = require('../models/EmailAccount');

function parseSelectedDepartments(value) {
  if (value === undefined || value === null || value === '') return undefined;
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw Object.assign(new Error('Selected departments are malformed.'), { code: 'INVALID_DEPARTMENT_SELECTION' });
    }
  }
  if (!Array.isArray(parsed)) {
    throw Object.assign(new Error('Selected departments must be provided as an array.'), { code: 'INVALID_DEPARTMENT_SELECTION' });
  }
  return parsed;
}

async function createCampaign(req, res, next) {
  try {
    const { name, subject, html, emailAccountId, emailAccountMode = 'specific' } = req.body;
    if (!name || !subject || !html) {
      return res.status(400).json({ success: false, message: 'Name, subject, and html body are required', code: 'INVALID_CAMPAIGN' });
    }
    if (!['specific', 'round_robin'].includes(emailAccountMode)) {
      return res.status(400).json({ success: false, message: 'Invalid email account assignment mode', code: 'INVALID_ACCOUNT_MODE' });
    }
    let resolvedAccountId = emailAccountMode === 'specific' ? emailAccountId || null : null;
    if (resolvedAccountId) {
      const ok = await EmailAccount.exists({ _id: resolvedAccountId, userId: req.user._id });
      if (!ok) return res.status(400).json({ success: false, message: 'Selected email account is not available to this user', code: 'INVALID_EMAIL_ACCOUNT' });
    }

    const campaign = await Campaign.create({
      userId: req.user._id,
      emailAccountId: resolvedAccountId,
      emailAccountMode,
      name,
      subject,
      html,
      status: 'draft',
    });

    logger.info({ campaignId: campaign._id, name }, 'Campaign created');
    return res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function listCampaigns(req, res, next) {
  try {
    const userId = req.user._id;
    const campaigns = await Campaign.find({
      $or: [{ userId }, { userId: null }],
    }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: campaigns });
  } catch (error) {
    next(error);
  }
}

async function getCampaignById(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function updateCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    if (['sending', 'paused', 'completed', 'cancelled', 'failed'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'Campaign cannot be edited after it has started or reached a terminal state', code: 'CAMPAIGN_LOCKED' });
    }

    const { name, subject, html, emailAccountId, emailAccountMode } = req.body;
    if (name) campaign.name = name;
    if (subject) campaign.subject = subject;
    if (html) campaign.html = html;
    if (emailAccountMode !== undefined) {
      if (!['specific', 'round_robin'].includes(emailAccountMode)) {
        return res.status(400).json({ success: false, message: 'Invalid email account assignment mode', code: 'INVALID_ACCOUNT_MODE' });
      }
      campaign.emailAccountMode = emailAccountMode;
      campaign.selectedEmailAccounts = [];
    }
    if (emailAccountId !== undefined) {
      if (!emailAccountId || campaign.emailAccountMode === 'round_robin') {
        campaign.emailAccountId = null;
      } else {
        const ok = await EmailAccount.exists({ _id: emailAccountId, userId: req.user._id });
        if (!ok) return res.status(400).json({ success: false, message: 'Selected email account is not available to this user', code: 'INVALID_EMAIL_ACCOUNT' });
        campaign.emailAccountId = emailAccountId;
      }
    }

    await campaign.save();
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function deleteCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    if (campaign.status === 'sending') {
      return res.status(400).json({ success: false, message: 'Cannot delete a campaign that is currently sending', code: 'CAMPAIGN_SENDING' });
    }

    await Recipient.deleteMany({ campaignId: campaign._id });
    await campaign.deleteOne();
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

async function startCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    if (campaign.status === 'sending') {
      const jobsQueued = await queuePendingRecipients(campaign._id);
      return res.status(200).json({ success: true, data: { campaign, jobsQueued } });
    }

    const recipientCount = await Recipient.countDocuments({ campaignId: campaign._id });
    if (recipientCount === 0) {
      return res.status(400).json({ success: false, message: 'Campaign cannot start without recipients', code: 'NO_RECIPIENTS' });
    }

    if (campaign.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cancelled campaigns cannot be restarted', code: 'CAMPAIGN_CANCELLED' });
    }

    if (!['draft', 'queued', 'paused'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'Campaign cannot be started from its current state', code: 'CAMPAIGN_NOT_STARTABLE' });
    }

    let selectedAccounts = [];
    let selectedAccountId = campaign.emailAccountId;
    if (campaign.emailAccountMode === 'round_robin') {
      selectedAccounts = await EmailAccount.find({
        userId: req.user._id,
        provider: 'gmail',
        verificationStatus: 'verified',
        connectionStatus: { $in: ['active', null] },
      })
        .select('_id email provider')
        .sort({ isDefault: -1, _id: 1 })
        .lean();
      if (!selectedAccounts.length) {
        return res.status(400).json({ success: false, message: 'Verify at least one active Gmail account before starting this campaign', code: 'NO_VERIFIED_GMAIL_ACCOUNTS' });
      }
      selectedAccountId = null;
    } else {
      if (!selectedAccountId) {
        const defaultAccount = await EmailAccount.findOne({ userId: req.user._id, isDefault: true }).select('_id email provider').lean();
        selectedAccountId = defaultAccount?._id || null;
      }
      if (!selectedAccountId) {
        return res.status(400).json({ success: false, message: 'Select a connected sending account before starting this campaign', code: 'NO_EMAIL_ACCOUNT' });
      }
      if (selectedAccountId) {
        const account = await EmailAccount.findOne({ _id: selectedAccountId, userId: req.user._id }).select('_id email provider verificationStatus connectionStatus').lean();
        if (!account) {
          return res.status(400).json({ success: false, message: 'Selected email account is no longer available', code: 'INVALID_EMAIL_ACCOUNT' });
        }
        if (account.provider === 'gmail' && account.verificationStatus !== 'verified') {
          return res.status(400).json({ success: false, message: 'Verify the selected Gmail account before starting this campaign', code: 'EMAIL_ACCOUNT_UNVERIFIED' });
        }
        if (account.connectionStatus === 'reconnect_required') {
          return res.status(400).json({ success: false, message: 'Reconnect the selected Gmail account before starting this campaign', code: 'GMAIL_RECONNECT_REQUIRED' });
        }
        selectedAccounts = [account];
      }
    }

    const now = new Date();
    const startedCampaign = await Campaign.findOneAndUpdate(
      { _id: campaign._id, status: { $in: ['draft', 'queued', 'paused'] } },
      {
        $set: {
          status: 'sending',
          startedAt: campaign.startedAt || now,
          completedAt: null,
          emailAccountId: selectedAccountId,
          selectedEmailAccounts: selectedAccounts.map((account) => ({
            emailAccountId: account._id,
            email: account.email,
            provider: account.provider,
          })),
        },
      },
      { new: true },
    );
    if (!startedCampaign) {
      return res.status(409).json({ success: false, message: 'Campaign is already being started or is no longer startable', code: 'CAMPAIGN_ALREADY_SENDING' });
    }

    const jobsQueued = await queuePendingRecipients(startedCampaign._id);
    logger.info({ campaignId: startedCampaign._id, jobsQueued, emailAccountId: startedCampaign.emailAccountId }, 'Campaign started');

    return res.status(200).json({ success: true, data: { campaign: startedCampaign, jobsQueued } });
  } catch (error) {
    next(error);
  }
}

async function pauseCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    if (campaign.status === 'paused') {
      return res.status(200).json({ success: true, data: campaign });
    }

    campaign.status = 'paused';
    await campaign.save();
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function resumeCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled' || campaign.status === 'failed') {
      return res.status(400).json({ success: false, message: 'Completed, failed, or cancelled campaigns cannot be resumed', code: 'CAMPAIGN_NOT_RESUMABLE' });
    }

    campaign.status = 'queued';
    await campaign.save();
    await queuePendingRecipients(campaign._id);
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function cancelCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    campaign.status = 'cancelled';
    campaign.completedAt = campaign.completedAt || new Date();
    await campaign.save();

    await Recipient.updateMany(
      { campaignId: campaign._id, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'cancelled', failedAt: new Date() } },
    );

    await recalculateCampaignCounters(campaign._id);
    logger.info({ campaignId: campaign._id }, 'Campaign cancelled');
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
}

async function getCampaignStats(req, res, next) {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }

    await recalculateCampaignCounters(campaign._id);
    const refreshedCampaign = await Campaign.findById(campaign._id).lean();

    const total = Number(refreshedCampaign.totalRecipients || 0);
    const sent = Number(refreshedCampaign.sentCount || 0);
    const failed = Number(refreshedCampaign.failedCount || 0);
    const cancelled = Number(refreshedCampaign.cancelledCount || 0);
    const processed = sent + failed + cancelled;
    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending: Number(refreshedCampaign.pendingCount || 0),
        processing: Number(refreshedCampaign.processingCount || 0),
        sent,
        failed,
        cancelled,
        processed,
        percentage,
        updatedAt: refreshedCampaign.updatedAt,
        createdAt: refreshedCampaign.createdAt,
        startedAt: refreshedCampaign.startedAt,
        completedAt: refreshedCampaign.completedAt,
        accountStats: await getCampaignAccountStats(campaign._id),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function uploadRecipients(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (!ensureCampaignOwnership(campaign, req)) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file is required', code: 'CSV_REQUIRED' });
    }

    const stats = await importRecipientsFromCsv(req.file.path, id, {
      allowInvalid: req.body.allowInvalid === 'true',
      selectedDepartments: parseSelectedDepartments(req.body.selectedDepartments),
    });

    return res.status(200).json({
      success: true,
      data: {
        ...stats,
        campaignId: id,
        campaignStatus: campaign ? campaign.status : null,
      },
    });
  } catch (error) {
    if (error.code === 'CSV_VALIDATION_FAILED' || error.code === 'DEPARTMENTS_REQUIRED' || error.code === 'INVALID_DEPARTMENT_SELECTION') {
      return res.status(422).json({
        success: false,
        message: error.message,
        code: error.code,
        data: error.details || {
          departments: error.departments,
          invalidDepartments: error.invalidDepartments,
        },
      });
    }
    return next(error);
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => null);
  }
}

async function validateRecipients(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file is required', code: 'CSV_REQUIRED' });
    }
    const stats = await validateRecipientsFromCsv(req.file.path, parseSelectedDepartments(req.body.selectedDepartments));
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    if (['DEPARTMENTS_REQUIRED', 'INVALID_DEPARTMENT_SELECTION'].includes(error.code)) {
      return res.status(422).json({
        success: false,
        message: error.message,
        code: error.code,
        data: { departments: error.departments, invalidDepartments: error.invalidDepartments },
      });
    }
    return next(error);
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => null);
  }
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignStats,
  validateRecipients,
  uploadRecipients,
};
