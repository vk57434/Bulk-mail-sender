const { QueueEvents } = require('bullmq');
const redisConnection = require('../config/redis');
const Recipient = require('../models/Recipient');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');
const {
  publishRecipientStatus,
  publishCampaignProgress,
  publishCampaignCompleted,
} = require('./campaign-events.bus');
const { recalculateCampaignCounters } = require('./campaign.service');

const QUEUE_NAME = 'emailQueue';
let queueEventsInstance = null;

function parseJobId(jobId) {
  if (!jobId || typeof jobId !== 'string') return null;
  const match = jobId.match(/^campaign-(.+)-recipient-(.+)$/);
  if (!match) return null;
  return { campaignId: match[1], recipientId: match[2] };
}

async function buildCampaignProgressPayload(campaignId) {
  try {
    const counters = await recalculateCampaignCounters(campaignId);
    if (!counters) return null;
    const total = Number(counters.totalRecipients || 0);
    const pending = Number(counters.pendingCount || 0);
    const processing = Number(counters.processingCount || 0);
    const sent = Number(counters.sentCount || 0);
    const failed = Number(counters.failedCount || 0);
    const cancelled = Number(counters.cancelledCount || 0);
    const processed = sent + failed + cancelled;
    return {
      type: 'campaign.progress',
      campaignId: String(campaignId),
      total,
      pending,
      processing,
      sent,
      failed,
      cancelled,
      processed,
      percentage: total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0,
      updatedAt: counters.updatedAt,
    };
  } catch (error) {
    logger.warn({ err: error, campaignId }, 'Unable to build campaign progress from QueueEvents');
    return null;
  }
}

async function emitCampaignProgressAndComplete(campaignId) {
  const progress = await buildCampaignProgressPayload(campaignId);
  if (!progress) return;

  publishCampaignProgress(progress);
  const allRecipientsSettled = progress.sent + progress.failed + progress.cancelled === progress.total;
  if (progress.pending !== 0 || progress.processing !== 0 || progress.total === 0 || !allRecipientsSettled) return;

  const campaign = await Campaign.findById(campaignId).select('status completedAt').lean();
  const shouldMarkComplete = campaign && !['completed', 'cancelled', 'failed'].includes(campaign.status);
  if (shouldMarkComplete) {
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'completed', completedAt: new Date() } }).catch(() => null);
  }
  publishCampaignCompleted({
    type: 'campaign.completed',
    campaignId: String(campaignId),
    total: progress.total,
    sent: progress.sent,
    failed: progress.failed,
    cancelled: progress.cancelled,
    updatedAt: progress.updatedAt,
  });
}

async function publishRecipientFromMongo(campaignId, recipientId) {
  const recipient = await Recipient.findOne({ _id: recipientId, campaignId })
    .select('_id name email status error processingAt sentAt failedAt providerMessageId updatedAt')
    .lean();
  if (!recipient) return;

  publishRecipientStatus({
    type: 'recipient.status',
    campaignId: String(campaignId),
    recipientId: String(recipient._id),
    name: recipient.name || '',
    email: recipient.email,
    status: String(recipient.status).toUpperCase(),
    error: recipient.error || '',
    processingAt: recipient.processingAt || null,
    sentAt: recipient.sentAt || null,
    failedAt: recipient.failedAt || null,
    providerMessageId: recipient.providerMessageId || null,
    updatedAt: recipient.updatedAt,
    timestamp: new Date().toISOString(),
  });
}

async function handleRecipientEvent(jobId, label) {
  const parsed = parseJobId(jobId);
  if (!parsed) return;
  const { campaignId, recipientId } = parsed;
  logger.info({ jobId, campaignId, recipientId }, label);
  await publishRecipientFromMongo(campaignId, recipientId);
  await emitCampaignProgressAndComplete(campaignId);
}

function startCampaignQueueEvents() {
  if (queueEventsInstance) {
    logger.info('[QueueEvents] Already started, returning existing instance');
    return queueEventsInstance;
  }

  logger.info({ queueName: QUEUE_NAME }, '[QueueEvents] Starting campaign listener');
  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisConnection.duplicate ? redisConnection.duplicate() : redisConnection,
  });

  queueEvents.on('waiting', ({ jobId }) => {
    const parsed = parseJobId(jobId);
    if (parsed) logger.debug({ jobId, ...parsed }, '[QUEUE] Recipient job waiting');
  });

  queueEvents.on('active', async ({ jobId }) => {
    const parsed = parseJobId(jobId);
    if (!parsed) return;
    logger.info({ jobId, ...parsed }, '[QUEUE] active event received');
    await emitCampaignProgressAndComplete(parsed.campaignId);
  });

  queueEvents.on('progress', async ({ jobId, data }) => {
    try {
      await handleRecipientEvent(jobId, '[QUEUE] Recipient status changed');
      logger.debug({ jobId, status: data?.status }, '[QueueEvents] progress event received');
    } catch (error) {
      logger.warn({ err: error, jobId }, '[QueueEvents] progress handler error');
    }
  });

  queueEvents.on('stalled', async ({ jobId }) => {
    try {
      await handleRecipientEvent(jobId, '[QUEUE] Recipient job stalled');
    } catch (error) {
      logger.warn({ err: error, jobId }, '[QueueEvents] stalled handler error');
    }
  });

  queueEvents.on('completed', async ({ jobId }) => {
    try {
      logger.info({ jobId, ...parseJobId(jobId) }, '[QueueEvents] completed event received');
      await handleRecipientEvent(jobId, '[QUEUE] Recipient job completed');
    } catch (error) {
      logger.warn({ err: error, jobId }, '[QueueEvents] completed handler error');
    }
  });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    try {
      logger.warn({ jobId, failedReason }, '[QueueEvents] failed event received');
      await handleRecipientEvent(jobId, '[QUEUE] Publishing persisted recipient failure/retry state');
    } catch (error) {
      logger.warn({ err: error, jobId }, '[QueueEvents] failed handler error');
    }
  });

  queueEvents.on('error', (error) => logger.warn({ err: error }, '[QueueEvents] connection error'));
  queueEvents.on('drained', () => logger.info('[QueueEvents] queue drained'));

  queueEventsInstance = queueEvents;
  return queueEvents;
}

async function stopCampaignQueueEvents() {
  if (!queueEventsInstance) return;
  try {
    await queueEventsInstance.close();
  } catch (error) {
    logger.warn({ err: error }, '[QueueEvents] close error');
  }
  queueEventsInstance = null;
}

module.exports = {
  startCampaignQueueEvents,
  stopCampaignQueueEvents,
  parseJobId,
};