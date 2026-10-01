const EmailAccount = require('../models/EmailAccount');
const { encrypt, decrypt } = require('../utils/credentials');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const redisConnection = require('../config/redis');
const config = require('../config/env');
const {
  isConfigured: isGmailConfigured,
  buildAuthUrl,
  generateState,
  exchangeCodeForTokens,
  fetchUserProfile,
  refreshAccessTokenIfNeeded,
  sendGmailMessage,
} = require('../services/gmail.service');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GMAIL_STATE_PREFIX = 'gmail:state:';
const GMAIL_STATE_TTL = 600;

const safe = (account) => ({
  id: account._id,
  provider: account.provider,
  email: account.email,
  displayName: account.displayName,
  isDefault: account.isDefault,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
});

const transportFor = (account) => {
  const c = decrypt(account.encryptedCredentials);
  return nodemailer.createTransport({
    host: c.host,
    port: Number(c.port),
    secure: c.security === 'ssl',
    auth: { user: c.username, pass: c.password },
  });
};

async function getDecryptedCredentials(account) {
  if (account.encryptedCredentials) return decrypt(account.encryptedCredentials);
  const reloaded = await EmailAccount.findById(account._id).select('+encryptedCredentials');
  if (!reloaded) throw Object.assign(new Error('Email account not found'), { statusCode: 404, code: 'ACCOUNT_NOT_FOUND' });
  return decrypt(reloaded.encryptedCredentials);
}

async function saveRefreshedCredentialsIfNeeded(accountId, credentialsPayload, sendResult) {
  if (!sendResult || !sendResult.refreshed || !sendResult.credentials) return;
  const encrypted = encrypt(sendResult.credentials);
  await EmailAccount.updateOne({ _id: accountId }, { $set: { encryptedCredentials: encrypted, updatedAt: new Date() } }).catch((error) => {
    logger.warn({ err: error, accountId }, 'Unable to persist refreshed Gmail credentials');
  });
}

async function list(req, res, next) {
  try {
    const accounts = await EmailAccount.find({ userId: req.user._id }).sort({ isDefault: -1 });
    res.json({ success: true, data: accounts.map(safe) });
  } catch (e) {
    next(e);
  }
}

async function configStatus(req, res, next) {
  try {
    res.json({
      success: true,
      data: { gmailConfigured: isGmailConfigured() },
    });
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const { provider = 'smtp', email, displayName, host, port, security, username, password } = req.body;
    if (provider !== 'smtp' || !email || !host || !port || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'SMTP email, host, port, username, and password are required.',
        code: 'SMTP_FIELDS_REQUIRED',
      });
    }
    const first = !(await EmailAccount.exists({ userId: req.user._id }));
    const account = await EmailAccount.create({
      userId: req.user._id,
      provider,
      email: String(email).toLowerCase().trim(),
      displayName: displayName || '',
      encryptedCredentials: encrypt({ host, port, security, username, password }),
      isDefault: first,
    });
    res.status(201).json({ success: true, data: safe(account) });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email address is already connected.' });
    }
    next(e);
  }
}

async function test(req, res, next) {
  try {
    const account = await EmailAccount.findOne({ _id: req.params.id, userId: req.user._id }).select('+encryptedCredentials');
    if (!account) return res.status(404).json({ success: false, message: 'Email account not found' });
    if (account.provider === 'smtp') {
      await transportFor(account).verify();
      return res.json({ success: true, data: { verified: true } });
    }
    if (account.provider === 'gmail') {
      const credentials = decrypt(account.encryptedCredentials);
      const { refreshed, credentials: activeCredentials } = await refreshAccessTokenIfNeeded(credentials);
      if (refreshed) {
        await EmailAccount.updateOne({ _id: account._id }, { $set: { encryptedCredentials: encrypt(activeCredentials), updatedAt: new Date() } }).catch(() => null);
      }
      return res.json({ success: true, data: { verified: true } });
    }
    return res.status(400).json({ success: false, message: 'Unsupported provider.' });
  } catch (e) {
    const message = e && e.reconnectRequired
      ? 'This Gmail account needs to be re-connected.'
      : 'Unable to verify this email account. Check its settings and try again.';
    return res.status(400).json({ success: false, message });
  }
}

async function remove(req, res, next) {
  try {
    const account = await EmailAccount.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Email account not found' });
    if (account.isDefault) {
      const nextAccount = await EmailAccount.findOne({ userId: req.user._id });
      if (nextAccount) {
        nextAccount.isDefault = true;
        await nextAccount.save();
      }
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
}

async function setDefault(req, res, next) {
  try {
    const account = await EmailAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ success: false, message: 'Email account not found' });
    await EmailAccount.updateMany({ userId: req.user._id }, { $set: { isDefault: false } });
    account.isDefault = true;
    await account.save();
    res.json({ success: true, data: safe(account) });
  } catch (e) {
    next(e);
  }
}

function frontendRedirectUrl(suffix = '') {
  return `${FRONTEND_URL.replace(/\/$/, '')}/email-accounts${suffix}`;
}

async function gmailConnect(req, res, next) {
  try {
    if (!isGmailConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Gmail OAuth is not configured on this server yet.',
        code: 'GMAIL_NOT_CONFIGURED',
      });
    }
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    const state = generateState();
    const userId = String(req.user._id);
    const payload = JSON.stringify({ userId, createdAt: Date.now() });
    const stateKey = `${GMAIL_STATE_PREFIX}${state}`;
    await redisConnection.set(stateKey, payload, 'EX', GMAIL_STATE_TTL);
    const authUrl = buildAuthUrl(state);
    res.json({ success: true, data: { authUrl } });
  } catch (e) {
    logger.error({ err: e }, 'Gmail connect initiation failed');
    res.status(500).json({
      success: false,
      message: 'Unable to start Gmail connection. Please try again.',
      code: 'GMAIL_CONNECT_FAILED',
    });
  }
}

async function gmailCallback(req, res, next) {
  const errorParam = req.query.error;
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');

  function redirectError(message) {
    const encoded = encodeURIComponent(message);
    res.redirect(frontendRedirectUrl(`?error=gmail&message=${encoded}`));
  }

  try {
    if (errorParam) {
      const friendly = {
        access_denied: 'You cancelled the Gmail sign-in.',
        redirect_uri_mismatch: 'Gmail callback URL mismatch. Check Google Cloud OAuth settings.',
        invalid_scope: 'Requested Google OAuth scopes are invalid.',
        temporarily_unavailable: 'Google is temporarily unavailable. Try again.',
      }[String(errorParam)] || 'Google returned an error during Gmail connection.';
      return redirectError(friendly);
    }
    if (!state || !code) {
      return redirectError('Gmail OAuth response is missing state or code.');
    }
    const stateKey = `${GMAIL_STATE_PREFIX}${state}`;
    const stored = await redisConnection.get(stateKey);
    await redisConnection.del(stateKey).catch(() => null);
    if (!stored) {
      return redirectError('Gmail OAuth state expired or invalid. Try again.');
    }
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return redirectError('Gmail OAuth state is corrupt. Try again.');
    }
    if (!parsed || !parsed.userId) {
      return redirectError('Gmail OAuth state missing user context. Try again.');
    }
    const authenticatedUserId = req.user ? String(req.user._id) : parsed.userId;
    if (req.user && String(req.user._id) !== parsed.userId) {
      return redirectError('Gmail OAuth state does not match your session.');
    }

    let tokens;
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (tokenError) {
      const errCode = String(tokenError.response?.data?.error || tokenError.code || '');
      const friendly = {
        invalid_grant: 'Gmail authorization code is invalid or expired. Try connecting again.',
        invalid_client: 'Gmail client credentials are misconfigured on the server.',
        redirect_uri_mismatch: 'Gmail callback URL mismatch in Google Cloud Console.',
      }[errCode] || 'Unable to exchange the Gmail authorization code for tokens.';
      logger.warn({ err: tokenError }, 'Gmail token exchange failed');
      return redirectError(friendly);
    }
    if (!tokens.refresh_token) {
      logger.warn({ userId: authenticatedUserId }, 'Google did not return a refresh token (prompt=consent not seen)');
      return redirectError('Gmail did not issue a refresh token. Try connecting again and ensure you approve offline access.');
    }

    let profile;
    try {
      profile = await fetchUserProfile(tokens);
    } catch (profileError) {
      logger.warn({ err: profileError }, 'Gmail profile fetch failed');
      return redirectError('Unable to read your Gmail account profile.');
    }

    const credentialsToStore = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || Date.now() + (Number(tokens.expires_in || 3599) * 1000),
      id_token: tokens.id_token || undefined,
    };

    const already = await EmailAccount.findOne({ userId: authenticatedUserId, email: profile.email });
    const encryptedCredentials = encrypt(credentialsToStore);
    let account;
    if (already) {
      already.displayName = profile.displayName || already.displayName;
      already.encryptedCredentials = encryptedCredentials;
      already.updatedAt = new Date();
      account = await already.save();
    } else {
      const first = !(await EmailAccount.exists({ userId: authenticatedUserId }));
      account = await EmailAccount.create({
        userId: authenticatedUserId,
        provider: 'gmail',
        email: profile.email,
        displayName: profile.displayName,
        encryptedCredentials,
        isDefault: first,
      });
    }
    logger.info({ accountId: account._id, userId: authenticatedUserId, email: profile.email }, 'Gmail account connected');
    res.redirect(frontendRedirectUrl('?connected=gmail'));
  } catch (e) {
    logger.error({ err: e }, 'Unhandled Gmail callback error');
    redirectError('Gmail connection failed due to a server error.');
  }
}

async function sendWithAccount(account, payload) {
  if (account.provider === 'smtp') {
    const transporter = transportFor(account);
    return transporter.sendMail({
      from: account.email,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }
  if (account.provider === 'gmail') {
    const credentials = await getDecryptedCredentials(account);
    const result = await sendGmailMessage({
      credentials,
      from: account.email,
      to: payload.to,
      cc: payload.cc || [],
      bcc: payload.bcc || [],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    await saveRefreshedCredentialsIfNeeded(account._id, credentials, result);
    return result;
  }
  throw Object.assign(new Error('Unsupported email account provider.'), { code: 'UNSUPPORTED_PROVIDER' });
}

async function markAccountReconnectRequired(accountId) {
  await EmailAccount.updateOne(
    { _id: accountId },
    { $set: { displayName: 'Reconnect required · ' + (new Date()).toISOString().slice(0, 10) } },
  ).catch(() => null);
}

module.exports = {
  safe,
  transportFor,
  list,
  configStatus,
  create,
  test,
  remove,
  setDefault,
  gmailConnect,
  gmailCallback,
  sendWithAccount,
  markAccountReconnectRequired,
};
