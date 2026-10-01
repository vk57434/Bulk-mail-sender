const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const Suppression = require('../models/Suppression');
const emailQueue = require('../queues/email.queue');
const logger = require('../utils/logger');

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

async function queuePendingRecipients(campaignId) {
  const recipients = await Recipient.find({ campaignId, status: 'pending' }).select('_id email');
  const suppressedByEmail = new Map(
    (await Suppression.find({ email: { $in: recipients.map((recipient) => recipient.email) } }).select('email reason'))
      .map((suppression) => [suppression.email, suppression.reason]),
  );
  let jobsQueued = 0;
  let jobsAlreadyQueued = 0;

  for (const recipient of recipients) {
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
  queuePendingRecipients,
};
