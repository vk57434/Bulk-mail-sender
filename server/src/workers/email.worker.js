const { Worker } = require('bullmq');
const config = require('../config/env');
const { connectMongo, disconnectMongo } = require('../config/db');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const EmailAccount = require('../models/EmailAccount');
const Suppression = require('../models/Suppression');
const { sendMail } = require('../services/mail.service');
const logger = require('../utils/logger');
const { replaceTemplateVariables, generateUnsubscribeToken } = require('../utils/template');
const { sendWithAccount, markAccountReconnectRequired } = require('../controllers/email-account.controller');

let lastEmailSentAt = 0;
let redisConnection;
let recalculateCampaignCounters;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enforceRateLimit() {
  const elapsed = Date.now() - lastEmailSentAt;
  const waitTime = Math.max(0, config.emailRateLimitMs - elapsed);
  if (waitTime > 0) await delay(waitTime);
}

function safeError(error) {
  if (!error) return 'Unknown email error';
  const message = String(error.message || error.code || error.name || 'Unknown email error');
  return message.length > 400 ? message.slice(0, 400) : message;
}

async function emitCampaignProgress(campaignId) {
  const campaign = await recalculateCampaignCounters(campaignId);
  if (!campaign) return;
  logger.info({
    campaignId: String(campaignId),
    total: campaign.totalRecipients,
    sent: campaign.sentCount,
    processing: campaign.processingCount,
    pending: campaign.pendingCount,
    failed: campaign.failedCount,
    cancelled: campaign.cancelledCount,
  }, '[CAMPAIGN] progress');
}

async function updateCampaignStatus(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return;

  const remaining = await Recipient.countDocuments({
    campaignId,
    status: { $nin: ['sent', 'failed', 'cancelled'] },
  });

  if (remaining > 0 && campaign.status !== 'cancelled' && campaign.status !== 'paused') {
    campaign.status = 'sending';
    await campaign.save();
  }

  if (remaining === 0 && campaign.status !== 'cancelled') {
    campaign.status = 'completed';
    campaign.completedAt = new Date();
    await campaign.save();
    logger.info({ campaignId }, 'Campaign completed');
  }
}

async function publishJobStatus(job, recipient, campaignId) {
  try {
    await job.updateProgress({
      campaignId: String(campaignId),
      recipientId: String(recipient._id),
      status: recipient.status,
      error: recipient.error || '',
      processingAt: recipient.processingAt || null,
      sentAt: recipient.sentAt || null,
      failedAt: recipient.failedAt || null,
      providerMessageId: recipient.providerMessageId || null,
      updatedAt: recipient.updatedAt || new Date(),
    });
  } catch (error) {
    logger.warn({ err: error, campaignId, recipientId: recipient._id }, '[QUEUE] Unable to publish recipient status');
  }
}

async function markProcessing(recipient, campaignId, job) {
  recipient.status = 'processing';
  recipient.processingAt = new Date();
  recipient.error = '';
  await recipient.save();
  await publishJobStatus(job, recipient, campaignId);
  logger.info({ campaignId, recipientId: recipient._id, status: 'processing' }, '[Worker] Processing recipient');
  logger.info({ campaignId, recipientId: recipient._id, email: recipient.email }, '[EMAIL] Processing');
}

async function markSent(recipient, campaignId, job, providerMessageId) {
  recipient.status = 'sent';
  recipient.sentAt = new Date();
  recipient.error = '';
  if (providerMessageId) recipient.providerMessageId = providerMessageId;
  await recipient.save();
  await publishJobStatus(job, recipient, campaignId);
  logger.info({ campaignId, recipientId: recipient._id, email: recipient.email }, '[EMAIL] Sent');
}

async function markFailed(recipient, campaignId, error, job) {
  recipient.status = 'failed';
  recipient.failedAt = new Date();
  recipient.error = safeError(error);
  await recipient.save();
  await publishJobStatus(job, recipient, campaignId);
  logger.error({ campaignId, recipientId: recipient._id, email: recipient.email, error: recipient.error }, '[EMAIL] Failed');
}

async function markCancelled(recipient, campaignId, reason, job) {
  recipient.status = 'cancelled';
  recipient.failedAt = new Date();
  recipient.error = reason || 'Cancelled';
  await recipient.save();
  await publishJobStatus(job, recipient, campaignId);
}

async function markTemporaryPending(recipient, campaignId, error, job) {
  recipient.status = 'pending';
  recipient.processingAt = null;
  recipient.error = safeError(error);
  await recipient.save();
  await publishJobStatus(job, recipient, campaignId);
}

async function processEmailJob(job) {
  const { campaignId, recipientId } = job.data;
  if (!campaignId || !recipientId) throw new Error('Job missing campaign or recipient data');

  logger.info({ jobId: job.id, campaignId, recipientId }, '[QUEUE] Recipient job started');
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    logger.warn({ campaignId }, 'Campaign not found for job');
    return;
  }

  if (campaign.status === 'paused' || campaign.status === 'cancelled') {
    logger.info({ campaignId, status: campaign.status }, 'Campaign will not process this job');
    return;
  }

  const recipient = await Recipient.findOne({ _id: recipientId, campaignId });
  if (!recipient) {
    logger.warn({ campaignId, recipientId }, 'Recipient not found for job');
    return;
  }
  if (recipient.status === 'sent' || recipient.status === 'cancelled') {
    logger.info({ recipientId }, '[CAMPAIGN] Recipient already terminal; skipping duplicate send');
    return;
  }

  const suppression = await Suppression.findOne({ email: recipient.email });
  if (suppression) {
    await markCancelled(recipient, String(campaign._id), `Suppressed: ${suppression.reason}`, job);
    await emitCampaignProgress(String(campaign._id));
    return;
  }

  await markProcessing(recipient, String(campaign._id), job);
  await emitCampaignProgress(String(campaign._id));

  let account = null;
  if (campaign.emailAccountId) {
    account = await EmailAccount.findOne({ _id: campaign.emailAccountId, userId: campaign.userId || null }).select('+encryptedCredentials');
    if (!account) {
      await markFailed(recipient, String(campaign._id), new Error('Campaign email account could not be loaded.'), job);
      await emitCampaignProgress(String(campaign._id));
      await updateCampaignStatus(campaignId);
      return;
    }
  }

  try {
    await enforceRateLimit();
    logger.info({ jobId: job.id, campaignId, recipientId, email: recipient.email, provider: account ? account.provider : 'smtp-fallback' }, '[CAMPAIGN] Email send started');
    const renderedHtml = replaceTemplateVariables(campaign.html, {
      name: recipient.name || recipient.email.split('@')[0],
      email: recipient.email,
      campaignName: campaign.name,
    });
    const token = generateUnsubscribeToken(recipient.email, process.env.JWT_SECRET || 'development_secret_replace_me');
    const finalHtml = renderedHtml.replace(/{{\s*unsubscribe_url\s*}}/g, `${process.env.APP_URL || 'http://localhost:5000'}/api/unsubscribe/${token}`);
    const finalSubject = replaceTemplateVariables(campaign.subject, {
      name: recipient.name || recipient.email.split('@')[0],
      email: recipient.email,
    });
    const finalText = finalHtml.replace(/<[^>]*>/g, ' ');

    let response;
    if (account) {
      response = await sendWithAccount(account, {
        to: [recipient.email],
        cc: [],
        bcc: [],
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
      });
    } else {
      response = await sendMail({
        to: recipient.email,
        from: account ? account.email : undefined,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
      });
    }

    const accepted = Array.isArray(response.accepted) ? response.accepted.map((value) => String(value).toLowerCase()) : [];
    const recipientEmail = String(recipient.email).toLowerCase();
    const acceptedByProvider = accepted.includes(recipientEmail) || (typeof response?.messageId === 'string' && accepted.length > 0);
    if (!acceptedByProvider) throw new Error('Email provider did not accept the email');

    recipient.attempts += 1;
    lastEmailSentAt = Date.now();
    logger.info({ campaignId, recipientId, status: 'sent' }, '[Worker] Gmail send accepted');
    logger.info({ campaignId, recipientId, email: recipient.email, messageId: response.messageId }, '[CAMPAIGN] Gmail accepted email');
    await markSent(recipient, String(campaign._id), job, response.messageId);
    logger.info({ campaignId, recipientId, status: 'sent' }, '[Worker] Recipient marked sent');
  } catch (error) {
    recipient.attempts += 1;
    const maxAttempts = job.opts?.attempts || 1;
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
    if (account && error?.reconnectRequired && isFinalAttempt) {
      markAccountReconnectRequired(account._id).catch(() => null);
    }

    if (isFinalAttempt) {
      logger.error({ campaignId, recipientId, email: recipient.email, error: safeError(error) }, '[CAMPAIGN] Recipient marked FAILED');
      await markFailed(recipient, String(campaign._id), error, job);
    } else {
      await markTemporaryPending(recipient, String(campaign._id), error, job);
      logger.warn({ err: error, campaignId, recipientId: recipient._id, attemptsMade: job.attemptsMade }, 'Temporary email failure; retry scheduled');
      await emitCampaignProgress(String(campaign._id));
      throw error;
    }
  }

  logger.info({ campaignId }, '[CAMPAIGN] Campaign state recalculated');
  await emitCampaignProgress(String(campaign._id));
  await updateCampaignStatus(campaignId);
}

async function bootstrapWorker() {
  await connectMongo();
  redisConnection = require('../config/redis');
  ({ recalculateCampaignCounters } = require('../services/campaign.service'));
  await redisConnection.ping();

  const queueName = 'emailQueue';
  const worker = new Worker(
    queueName,
    async (job) => {
      await processEmailJob(job);
      return { ok: true };
    },
    {
      connection: redisConnection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: Number(config.emailRateLimitMs) || 10000,
      },
      autorun: true,
    },
  );

  worker.on('ready', () => logger.info({ queueName }, 'Worker ready'));
  worker.on('active', (job) => logger.info({ jobId: job.id, campaignId: job.data.campaignId, recipientId: job.data.recipientId }, '[QUEUE] Recipient job started'));
  worker.on('progress', (job, progress) => logger.info({ jobId: job.id, progress }, '[QUEUE] Recipient status published'));
  worker.on('completed', (job) => logger.info({ jobId: job.id, queueName }, '[QUEUE] Recipient job completed'));
  worker.on('failed', (job, error) => logger.error({ err: error, jobId: job && job.id, campaignId: job && job.data.campaignId, recipientId: job && job.data.recipientId }, 'Email job failed'));
  worker.on('error', (error) => logger.error({ err: error, queueName }, 'Email worker error'));
  logger.info({ queueName }, 'BullMQ email worker started');

  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Worker shutting down gracefully');
    try {
      await worker.close();
      await redisConnection.quit();
      await disconnectMongo();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Worker shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrapWorker().catch((error) => {
  logger.error({ err: error }, 'Email worker failed to start');
  process.exit(1);
});