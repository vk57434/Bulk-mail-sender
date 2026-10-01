const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const Suppression = require('../models/Suppression');
const mongoose = require('mongoose');
const emailQueue = require('../queues/email.queue');
const logger = require('../utils/logger');
const { selectRoundRobinAccount } = require('../utils/round-robin');

async function recalculateCampaignCounters(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return null;

  const totalRecipients = await Recipient.countDocuments({ campaignId });
  const pending = await Recipient.countDocuments({ campaignId, status: 'pending' });
  const processing = await Recipient.countDocuments({ campaignId, status: 'processing' });
  const sent = await Recipient.countDocuments({ campaignId, status: 'sent' });
  const failed = await Recipient.countDocuments({ campaignId, status: 'failed' });
  const cancelled = await Recipient.countDocuments({ campaignId, status: 'cancelled' });

  campaign.totalRecipients = totalRecipients;
  campaign.pendingCount = pending;
  campaign.processingCount = processing;
  campaign.sentCount = sent;
  campaign.failedCount = failed;
  campaign.cancelledCount = cancelled;

  const terminalStatuses = ['sent', 'failed', 'cancelled'];
  const remainingCount = await Recipient.countDocuments({
    campaignId,
    status: { $nin: terminalStatuses },
  });

  if (campaign.status === 'sending' && totalRecipients > 0 && remainingCount === 0 && !campaign.completedAt) {
    campaign.status = 'completed';
    campaign.completedAt = new Date();
    logger.info({ campaignId: campaign._id }, 'Campaign completed automatically');
  }

  await campaign.save();
  return campaign;
}

async function getCampaignAccountStats(campaignId) {
  const rows = await Recipient.aggregate([
    { $match: { campaignId: new mongoose.Types.ObjectId(String(campaignId)) } },
    {
      $group: {
        _id: '$emailAccountId',
        assigned: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
      },
    },
  ]);
  return rows.map((row) => ({
    emailAccountId: row._id ? String(row._id) : null,
    assigned: row.assigned,
    sent: row.sent,
    failed: row.failed,
    pending: row.pending,
    processing: row.processing,
  }));
}

async function queuePendingRecipients(campaignId) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) throw new Error('Campaign not found while queueing recipients');
  const recipients = await Recipient.find({ campaignId, status: 'pending' })
    .select('_id email sequence emailAccountId senderEmail')
    .sort({ sequence: 1, createdAt: 1, _id: 1 });
  const assignedAccounts = campaign.selectedEmailAccounts || [];
  if (campaign.emailAccountMode === 'round_robin' && !assignedAccounts.length) {
    throw new Error('Campaign has no saved round-robin account selection');
  }
  const specificAccount = assignedAccounts[0] || (campaign.emailAccountId ? {
    emailAccountId: campaign.emailAccountId,
    email: '',
  } : null);
  const suppressedByEmail = new Map(
    (await Suppression.find({ email: { $in: recipients.map((recipient) => recipient.email) } }).select('email reason'))
      .map((suppression) => [suppression.email, suppression.reason]),
  );
  let jobsQueued = 0;
  let jobsAlreadyQueued = 0;

  for (let index = 0; index < recipients.length; index += 1) {
    let recipient = recipients[index];
    const suppressionReason = suppressedByEmail.get(recipient.email);
    if (suppressionReason) {
      await Recipient.updateOne(
        { _id: recipient._id, status: 'pending' },
        {
          $set: {
            status: 'cancelled',
            error: `Suppressed: ${suppressionReason}`,
            failedAt: new Date(),
          },
        },
      );
      continue;
    }

    if (!recipient.emailAccountId && (campaign.emailAccountMode === 'round_robin' || specificAccount)) {
      const sequence = Number.isInteger(recipient.sequence) ? recipient.sequence : index;
      const selected = campaign.emailAccountMode === 'round_robin'
        ? selectRoundRobinAccount(sequence, assignedAccounts)
        : specificAccount;
      await Recipient.updateOne(
        { _id: recipient._id, status: 'pending', emailAccountId: null },
        { $set: { emailAccountId: selected.emailAccountId, senderEmail: selected.email } },
      );
      recipient = await Recipient.findById(recipient._id).select('_id email emailAccountId senderEmail');
    }

    const jobId = `campaign-${campaignId.toString()}-recipient-${recipient._id.toString()}`;
    if (await emailQueue.getJob(jobId)) {
      jobsAlreadyQueued += 1;
      continue;
    }

    await emailQueue.add(
      'send-email',
      {
        campaignId: campaignId.toString(),
        recipientId: recipient._id.toString(),
      },
      {
        jobId,
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
    jobsQueued += 1;
  }

  logger.info({ campaignId, jobsQueued, jobsAlreadyQueued }, 'Email jobs queued');
  return jobsQueued;
}

module.exports = {
  recalculateCampaignCounters,
  getCampaignAccountStats,
  queuePendingRecipients,
};
