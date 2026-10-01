const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const fs = require('fs/promises');
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const { validateRecipientsFromCsv, importRecipientsFromCsv } = require('../services/recipient.service');
const { queuePendingRecipients, recalculateCampaignCounters } = require('../services/campaign.service');
const logger = require('../utils/logger');
const { generateUnsubscribeToken } = require('../utils/template');
const config = require('../config/env');

function ensureCampaignOwnership(campaign, req) {
  if (!campaign) return false;
  if (!campaign.userId) return true;
  return String(campaign.userId) === String(req.user._id);
}

const EmailAccount = require('../models/EmailAccount');

async function createCampaign(req, res, next) {
  try {
    const { name, subject, html, emailAccountId } = req.body;
    if (!name || !subject || !html) {
      return res.status(400).json({ success: false, message: 'Name, subject, and html body are required', code: 'INVALID_CAMPAIGN' });
    }
    let resolvedAccountId = emailAccountId || null;
    if (resolvedAccountId) {
      const ok = await EmailAccount.exists({ _id: resolvedAccountId, userId: req.user._id });
      if (!ok) resolvedAccountId = null;
    }

    const campaign = await Campaign.create({
      userId: req.user._id,
      emailAccountId: resolvedAccountId,
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

    const { name, subject, html, emailAccountId } = req.body;
    if (name) campaign.name = name;
    if (subject) campaign.subject = subject;
    if (html) campaign.html = html;
    if (emailAccountId !== undefined) {
      if (!emailAccountId) {
        campaign.emailAccountId = null;
      } else {
        const ok = await EmailAccount.exists({ _id: emailAccountId, userId: req.user._id });
        if (ok) campaign.emailAccountId = emailAccountId;
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
      return res.status(400).json({ success: false, message: 'Campaign is already sending', code: 'CAMPAIGN_ALREADY_SENDING' });
    }

    const recipientCount = await Recipient.countDocuments({ campaignId: campaign._id });
    if (recipientCount === 0) {
      return res.status(400).json({ success: false, message: 'Campaign cannot start without recipients', code: 'NO_RECIPIENTS' });
    }

    if (campaign.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cancelled campaigns cannot be restarted', code: 'CAMPAIGN_CANCELLED' });
    }

    if (!campaign.emailAccountId) {
      const defaultAccount = await EmailAccount.findOne({ userId: req.user._id, isDefault: true });
      if (defaultAccount) {
        campaign.emailAccountId = defaultAccount._id;
      }
    }

    campaign.status = 'sending';
    campaign.startedAt = campaign.startedAt || new Date();
    campaign.completedAt = null;
    await campaign.save();

    const jobsQueued = await queuePendingRecipients(campaign._id);
    logger.info({ campaignId: campaign._id, jobsQueued, emailAccountId: campaign.emailAccountId }, 'Campaign started');

    return res.status(200).json({ success: true, data: { campaign, jobsQueued } });
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
    if (error.code === 'CSV_VALIDATION_FAILED') {
      return res.status(422).json({
        success: false,
        message: error.message,
        code: error.code,
        data: error.details,
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
    const stats = await validateRecipientsFromCsv(req.file.path);
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
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
