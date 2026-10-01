const Email = require('../models/Email');
const EmailAccount = require('../models/EmailAccount');
const Recipient = require('../models/Recipient');
const Campaign = require('../models/Campaign');
const { sendWithAccount, markAccountReconnectRequired } = require('./email-account.controller');
const logger = require('../utils/logger');

const addresses = (value) =>
  String(value || '')
    .split(/[;,\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

async function send(req, res, next) {
  try {
    const { emailAccountId, to, cc, bcc, subject, html, text } = req.body;
    const recipients = addresses(to);
    if (
      !emailAccountId ||
      !recipients.length ||
      !recipients.every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) ||
      !String(subject || '').trim() ||
      !String(html || text || '').trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Choose an account and provide valid recipients, subject, and message.',
        code: 'SEND_FIELDS_REQUIRED',
      });
    }
    const account = await EmailAccount.findOne({ _id: emailAccountId, userId: req.user._id }).select('+encryptedCredentials');
    if (!account) {
      return res.status(404).json({ success: false, message: 'Email account not found.', code: 'ACCOUNT_NOT_FOUND' });
    }

    const email = await Email.create({
      userId: req.user._id,
      emailAccountId: account._id,
      from: account.email,
      to: recipients,
      cc: addresses(cc),
      bcc: addresses(bcc),
      subject,
      html: html || '',
      text: text || '',
      status: 'PENDING',
      provider: account.provider,
      queuedAt: new Date(),
    });

    try {
      email.status = 'PROCESSING';
      email.processingAt = new Date();
      await email.save();

      const response = await sendWithAccount(account, {
        to: recipients,
        cc: addresses(cc),
        bcc: addresses(bcc),
        subject,
        html: html || '',
        text: text || (html ? html.replace(/<[^>]*>/g, ' ') : ''),
      });
      const accepted = Array.isArray(response.accepted) ? response.accepted : recipients;
      if (!accepted.length) {
        throw Object.assign(new Error('Provider did not accept any recipients.'), { code: 'NO_ACCEPTED_RECIPIENTS' });
      }
      email.status = 'SENT';
      email.sentAt = new Date();
      email.providerMessageId = response.messageId || null;
      await email.save();
      return res.status(201).json({ success: true, data: { id: email._id, status: 'SENT', messageId: response.messageId || null } });
    } catch (error) {
      logger.warn({ err: error, emailAccountId, to: recipients }, 'Single send failed');
      email.status = 'FAILED';
      email.failedAt = new Date();
      if (error && error.reconnectRequired) {
        markAccountReconnectRequired(account._id).catch(() => null);
        email.error = 'Authentication expired. Please reconnect this Gmail account.';
      } else {
        const safe = String(error.message || 'Unable to send email with this account.').slice(0, 240);
        email.error = safe;
      }
      await email.save();
      return res.status(400).json({
        success: false,
        message: email.error,
        code: error && error.code ? error.code : 'SEND_FAILED',
      });
    }
  } catch (e) {
    next(e);
  }
}

async function history(req, res, next) {
  try {
    const userId = req.user._id;
    const statusMap = { 'sent': 'SENT', 'failed': 'FAILED', 'queued': 'PENDING', 'pending': 'PENDING', 'processing': 'PROCESSING' };
    const recipientStatusMap = { 'sent': 'sent', 'failed': 'failed', 'queued': 'pending', 'pending': 'pending', 'processing': 'processing' };
    
    // Build query for single emails (Email collection)
    const emailQuery = { userId };
    if (statusMap[req.query.status]) emailQuery.status = statusMap[req.query.status];
    if (req.query.q) emailQuery.$or = [{ subject: new RegExp(req.query.q, 'i') }, { to: new RegExp(req.query.q, 'i') }];
    
    // Build query for campaign emails (Recipient collection)
    const campaigns = await Campaign.find({ userId }).select('_id subject').lean();
    const campaignIds = campaigns.map(c => c._id);
    const campaignMap = new Map(campaigns.map(c => [String(c._id), c.subject]));
    
    const recipientQuery = { campaignId: { $in: campaignIds } };
    if (recipientStatusMap[req.query.status]) recipientQuery.status = recipientStatusMap[req.query.status];
    if (req.query.q) recipientQuery.$or = [{ email: new RegExp(req.query.q, 'i') }];
    
    // Fetch from both collections in parallel
    const [singleEmails, campaignRecipients] = await Promise.all([
      Email.find(emailQuery).sort({ createdAt: -1 }).limit(100).lean(),
      campaignIds.length > 0
        ? Recipient.find(recipientQuery).sort({ sentAt: -1, createdAt: -1 }).limit(100).lean()
        : []
    ]);
    
    // Transform campaign recipients to match email format
    const campaignEmails = campaignRecipients.map(r => ({
      _id: r._id,
      userId: r.userId,
      emailAccountId: null,
      from: null,
      to: [r.email],
      cc: [],
      bcc: [],
      subject: campaignMap.get(String(r.campaignId)) || '(Campaign Email)',
      html: '',
      text: '',
      status: r.status.toUpperCase(),
      provider: 'campaign',
      providerMessageId: null,
      error: r.error || '',
      queuedAt: r.queuedAt,
      processingAt: r.processingAt,
      sentAt: r.sentAt,
      failedAt: r.failedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isCampaign: true,
      campaignId: r.campaignId,
    }));
    
    // Combine and sort by date (sentAt preferred, then createdAt)
    const allEmails = [...singleEmails, ...campaignEmails].sort((a, b) => {
      const dateA = a.sentAt || a.createdAt;
      const dateB = b.sentAt || b.createdAt;
      return new Date(dateB) - new Date(dateA);
    }).slice(0, 100);
    
    logger.info({ userId, singleCount: singleEmails.length, campaignCount: campaignEmails.length, total: allEmails.length }, '[HISTORY] Records fetched');
    
    res.json({ success: true, data: allEmails });
  } catch (e) {
    next(e);
  }
}

async function get(req, res, next) {
  try {
    const email = await Email.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });
    res.json({ success: true, data: email });
  } catch (e) {
    next(e);
  }
}

module.exports = { send, history, get };
