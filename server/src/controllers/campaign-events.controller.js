const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const config = require('../config/env');
const logger = require('../utils/logger');
const { subscribe, publishCampaignProgress } = require('../services/campaign-events.bus');
const { recalculateCampaignCounters } = require('../services/campaign.service');

const eventTokens = new Map();

function generateEventToken(userId, campaignId) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      sub: String(userId),
      campaignId: String(campaignId),
      jti,
      scope: 'campaign-events',
    },
    config.jwtSecret,
    { expiresIn: '5m' },
  );
  eventTokens.set(jti, {
    userId: String(userId),
    campaignId: String(campaignId),
    consumedAt: 0,
    createdAt: Date.now(),
  });
  setTimeout(() => eventTokens.delete(jti), 5 * 60 * 1000);
  return { token, jti };
}

async function generateEventsToken(req, res, next) {
  try {
    const { campaignId } = req.params;
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
    }
    const userId = String(req.user._id);
    if (!campaign.userId) {
      campaign.userId = userId;
      await campaign.save().catch(() => null);
    } else if (String(campaign.userId) !== userId) {
      return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
    }
    const { token } = generateEventToken(req.user._id, campaign._id);
    return res.status(200).json({ success: true, data: { token } });
  } catch (error) {
    next(error);
  }
}

function writeSse(res, eventName, payload) {
  if (!res || res.writableEnded || res.destroyed) return false;
  try {
    if (eventName) {
      res.write(`event: ${eventName}\n`);
    }
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
    return true;
  } catch {
    return false;
  }
}

async function buildProgressPayload(campaignId) {
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
    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
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
      percentage,
      updatedAt: counters.updatedAt,
    };
  } catch (error) {
    logger.warn({ err: error, campaignId }, 'Unable to build SSE progress payload');
    return null;
  }
}

async function streamCampaignEvents(req, res, next) {
  const { campaignId } = req.params;
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ success: false, message: 'Event token is required', code: 'EVENT_TOKEN_REQUIRED' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded || decoded.scope !== 'campaign-events') {
      return res.status(401).json({ success: false, message: 'Invalid event token scope', code: 'INVALID_EVENT_TOKEN' });
    }
    if (String(decoded.campaignId) !== String(campaignId)) {
      return res.status(403).json({ success: false, message: 'Event token is not valid for this campaign', code: 'TOKEN_CAMPAIGN_MISMATCH' });
    }
    const record = eventTokens.get(decoded.jti);
    if (!record) {
      return res.status(401).json({ success: false, message: 'Event token expired or revoked; request a new token', code: 'EVENT_TOKEN_EXPIRED' });
    }
    if (String(record.userId) !== String(decoded.sub)) {
      return res.status(401).json({ success: false, message: 'Event token belongs to a different user', code: 'EVENT_TOKEN_USER' });
    }
    if (String(record.campaignId) !== String(campaignId)) {
      return res.status(403).json({ success: false, message: 'Event token campaign mismatch', code: 'EVENT_TOKEN_CAMPAIGN' });
    }
    const RECONNECT_GRACE_MS = 3 * 60 * 1000;
    if (record.consumedAt > 0 && Date.now() - record.consumedAt > RECONNECT_GRACE_MS) {
      return res.status(401).json({ success: false, message: 'Event token expired after reconnect window; request a new token', code: 'EVENT_TOKEN_EXPIRED' });
    }
    if (record.consumedAt === 0) {
      record.consumedAt = Date.now();
    }
  } catch (error) {
    logger.warn({ err: error }, 'SSE event token verification failed');
    return res.status(401).json({ success: false, message: 'Invalid event token', code: 'INVALID_EVENT_TOKEN' });
  }

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
  }

  const eventUserId = String(decoded.sub);

  if (!campaign.userId) {
    campaign.userId = eventUserId;
    await campaign.save().catch(() => null);
  } else if (String(campaign.userId) !== eventUserId) {
    return res.status(403).json({ success: false, message: 'Campaign does not belong to this user', code: 'CAMPAIGN_OWNERSHIP' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();

  writeSse(res, 'connected', {
    type: 'connected',
    campaignId: String(campaignId),
    timestamp: new Date().toISOString(),
  });

  logger.info(`[SSE] Client connected campaign=${campaignId}`);

  const unsubscribe = subscribe(campaignId, (event) => {
    if (!event) return;
    if (event.type === 'recipient.status') {
      const status = String(event.status || '').toUpperCase();
      logger.info(`[SSE] Broadcasting recipient_status campaign=${campaignId} recipient=${event.recipientId} status=${status}`);
      writeSse(res, 'recipient_status', { ...event, status });
    } else if (event.type === 'campaign.progress') {
      logger.info({ campaignId, percentage: event.percentage }, '[SSE] Sending campaign progress');
      writeSse(res, 'campaign-progress', event);
    } else if (event.type === 'campaign.completed') {
      logger.info({ campaignId }, '[SSE] Sending campaign completed');
      writeSse(res, 'campaign-completed', event);
    } else {
      writeSse(res, 'event', event);
    }
  });
  logger.info(`[SSE] Campaign subscribed: ${campaignId}`);

  setImmediate(async () => {
    try {
      const recipients = await Recipient.find({ campaignId })
        .select('_id name email status error sentAt processingAt failedAt updatedAt')
        .sort({ createdAt: 1 })
        .limit(500)
        .lean();
      writeSse(res, 'recipient.snapshot', {
        type: 'recipient.snapshot',
        campaignId: String(campaignId),
        recipients: recipients.map((r) => ({
          recipientId: String(r._id),
          name: r.name,
          email: r.email,
          status: r.status,
          error: r.error || '',
          sentAt: r.sentAt || null,
          failedAt: r.failedAt || null,
          processingAt: r.processingAt || null,
          updatedAt: r.updatedAt,
        })),
      });
      logger.info({ campaignId, recipientCount: recipients.length }, '[SSE] Sent recipient snapshot');
      const progress = await buildProgressPayload(campaignId);
      if (progress) {
        writeSse(res, 'campaign-progress', progress);
        logger.info({ campaignId, progressPercentage: progress.percentage }, '[SSE] Sent initial progress');
      }
    } catch (error) {
      logger.warn({ err: error, campaignId }, 'Unable to send initial SSE snapshot');
    }
  });

  const heartbeatInterval = setInterval(() => {
    writeSse(res, 'ping', { type: 'ping', timestamp: new Date().toISOString() });
  }, 15000);

  let connectionClosed = false;
  const onClose = () => {
    if (connectionClosed) return;
    connectionClosed = true;
    clearInterval(heartbeatInterval);
    try { unsubscribe(); } catch { /* ignore */ }
    logger.info(`[SSE] Client disconnected campaign=${campaignId}`);
    if (!res.writableEnded) {
      try { res.end(); } catch { /* ignore */ }
    }
  };

  req.on('aborted', onClose);
  res.on('close', onClose);
}

module.exports = {
  generateEventsToken,
  streamCampaignEvents,
};
