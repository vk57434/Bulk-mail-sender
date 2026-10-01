const EmailAccount = require('../models/EmailAccount');
const { generateOtp, hashOtp, verifyOtp } = require('../utils/email-otp');
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
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const safe = (account) => ({
  id: account._id,
  provider: account.provider,
  email: account.email,
  displayName: account.displayName,
  isDefault: account.isDefault,
  connectionStatus: account.connectionStatus || 'active',
  verificationStatus: account.provider === 'gmail' ? account.verificationStatus || 'pending' : 'verified',
  verifiedAt: account.provider === 'gmail' ? account.verifiedAt || null : null,
  otpExpiresAt: account.provider === 'gmail' && account.verificationStatus === 'pending' ? account.otpExpiresAt || null : null,
  otpAttemptsRemaining: account.provider === 'gmail' && account.verificationStatus === 'pending'
    ? Math.max(0, OTP_MAX_ATTEMPTS - Number(account.otpAttempts || 0))
    : 0,
  otpResendAvailableAt: account.provider === 'gmail' && account.otpLastSentAt
    ? new Date(account.otpLastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS)
    : null,
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
    const accounts = await EmailAccount.find({ userId: req.user._id }).sort({ isDefault: -1, _id: 1 });
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
      connectionStatus: 'active',
      verificationStatus: 'verified',
      verifiedAt: new Date(),
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
    if (e?.reconnectRequired) await markAccountReconnectRequired(req.params.id);
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
  function redirectVerification(account, message = '') {
    const query = new URLSearchParams({ verify: 'gmail', accountId: String(account._id) });
    if (message) query.set('message', message);
    res.redirect(frontendRedirectUrl(`?${query.toString()}`));
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
    if (!profile.verifiedEmail) {
      return redirectError('Google did not confirm that this Gmail address is verified. Try connecting again.');
    }

    const credentialsToStore = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date || Date.now() + (Number(tokens.expires_in || 3599) * 1000),
      id_token: tokens.id_token || undefined,
    };

    const encryptedCredentials = encrypt(credentialsToStore);
    let account;
    const already = await EmailAccount.findOne({ userId: authenticatedUserId, email: profile.email });
    const pendingChanges = {
      displayName: profile.displayName || already?.displayName || '',
      encryptedCredentials,
      verificationStatus: 'pending',
      connectionStatus: 'active',
      verifiedAt: null,
      otpAttempts: 0,
      otpResendCount: 0,
      otpResendWindowStartedAt: null,
      otpLastSentAt: null,
    };
    if (already) {
      Object.assign(already, pendingChanges);
      already.otpHash = null;
      already.otpSalt = null;
      already.otpExpiresAt = null;
      account = await already.save();
    } else {
      const first = !(await EmailAccount.exists({ userId: authenticatedUserId }));
      try {
        account = await EmailAccount.create({
          userId: authenticatedUserId,
          provider: 'gmail',
          email: profile.email,
          ...pendingChanges,
          isDefault: first,
        });
      } catch (createError) {
        if (createError.code !== 11000) throw createError;
        account = await EmailAccount.findOne({ userId: authenticatedUserId, email: profile.email });
        if (!account) throw createError;
        Object.assign(account, pendingChanges);
        account.otpHash = null;
        account.otpSalt = null;
        account.otpExpiresAt = null;
        account = await account.save();
      }
    }
    try {
      await issueVerificationOtp(account._id, authenticatedUserId, { initial: true });
      logger.info({ accountId: account._id, userId: authenticatedUserId, email: profile.email }, 'Gmail connected; verification email submitted');
      redirectVerification(account);
    } catch (deliveryError) {
      logger.warn({ err: deliveryError, accountId: account._id, userId: authenticatedUserId }, 'Gmail verification email could not be submitted');
      redirectVerification(account, 'Gmail connected, but the verification email could not be sent. Check Gmail sending access and try again.');
    }
  } catch (e) {
    logger.error({ err: e }, 'Unhandled Gmail callback error');
    redirectError('Gmail connection failed due to a server error.');
  }
}

async function issueVerificationOtp(accountId, userId, { initial = false } = {}) {
  const account = await EmailAccount.findOne({ _id: accountId, userId, provider: 'gmail' }).select('+encryptedCredentials');
  if (!account) throw Object.assign(new Error('Gmail account not found.'), { statusCode: 404, code: 'EMAIL_ACCOUNT_NOT_FOUND' });
  if (account.connectionStatus === 'reconnect_required') {
    throw Object.assign(new Error('Reconnect this Gmail account with Google before requesting a verification code.'), { statusCode: 409, code: 'GMAIL_RECONNECT_REQUIRED' });
  }
  if (account.verificationStatus === 'verified') {
    throw Object.assign(new Error('This Gmail account is already verified.'), { statusCode: 409, code: 'ACCOUNT_ALREADY_VERIFIED' });
  }

  const now = new Date();
  const windowIsActive = account.otpResendWindowStartedAt && now - account.otpResendWindowStartedAt < 60 * 60 * 1000;
  if (!initial && account.otpLastSentAt && now - account.otpLastSentAt < OTP_RESEND_COOLDOWN_MS) {
    throw Object.assign(new Error('Wait 60 seconds before requesting another verification code.'), { statusCode: 429, code: 'OTP_RESEND_COOLDOWN' });
  }
  if (!initial && windowIsActive && Number(account.otpResendCount || 0) >= OTP_MAX_SENDS_PER_HOUR) {
    throw Object.assign(new Error('Verification email limit reached. Try again in an hour.'), { statusCode: 429, code: 'OTP_RESEND_LIMIT' });
  }

  const otp = generateOtp();
  const { salt, hash } = await hashOtp(otp);
  const resendCount = initial ? 1 : windowIsActive ? Number(account.otpResendCount || 0) + 1 : 1;
  const challengeFilter = {
    _id: accountId,
    userId,
    provider: 'gmail',
    verificationStatus: { $in: ['pending', 'expired', null] },
    otpLastSentAt: account.otpLastSentAt || null,
  };
  if (Number(account.otpResendCount || 0) > 0) {
    challengeFilter.otpResendCount = Number(account.otpResendCount);
  } else {
    challengeFilter.$or = [{ otpResendCount: 0 }, { otpResendCount: { $exists: false } }];
  }
  const challenge = await EmailAccount.findOneAndUpdate(
    challengeFilter,
    {
      $set: {
        verificationStatus: 'pending',
        connectionStatus: 'active',
        verifiedAt: null,
        otpHash: hash,
        otpSalt: salt,
        otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        otpAttempts: 0,
        otpLastSentAt: now,
        otpResendCount: resendCount,
        otpResendWindowStartedAt: windowIsActive ? account.otpResendWindowStartedAt : now,
      },
    },
    { new: true },
  ).select('+encryptedCredentials');
  if (!challenge) {
    throw Object.assign(new Error('A verification request is already in progress. Refresh the account status and try again.'), { statusCode: 409, code: 'OTP_REQUEST_CONFLICT' });
  }

  try {
    const result = await sendWithAccount(challenge, {
      to: [challenge.email],
      cc: [],
      bcc: [],
      purpose: 'account-verification',
      subject: 'Verify your MailFlow Gmail account',
      text: `Your MailFlow verification code is ${otp}. It expires in 5 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your MailFlow verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes. If you did not request this, you can ignore this email.</p>`,
    });
    if (!result?.messageId) throw new Error('Gmail did not confirm the verification email submission.');
  } catch (error) {
    const expiryUpdate = {
      $set: { verificationStatus: 'expired', verifiedAt: null, otpAttempts: 0 },
      $unset: { otpHash: '', otpSalt: '', otpExpiresAt: '' },
    };
    await EmailAccount.updateOne({ _id: accountId, userId, otpHash: hash }, expiryUpdate).catch(() => null);
    if (error.reconnectRequired) await markAccountReconnectRequired(accountId);
    throw Object.assign(new Error(error.reconnectRequired
      ? 'Gmail authorization has expired. Reconnect the account before requesting verification again.'
      : 'Gmail could not send the verification email. Check Gmail sending permission and retry.'), {
      statusCode: error.statusCode || 502,
      code: error.reconnectRequired ? 'GMAIL_RECONNECT_REQUIRED' : 'OTP_DELIVERY_FAILED',
    });
  }
  return challenge;
}

async function verifyEmailAccount(req, res, next) {
  try {
    const otp = String(req.body?.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit verification code.', code: 'INVALID_OTP_FORMAT' });
    }
    const query = { _id: req.params.id, userId: req.user._id, provider: 'gmail' };
    const account = await EmailAccount.findOne(query).select('+otpHash +otpSalt');
    if (!account) return res.status(404).json({ success: false, message: 'Gmail account not found.', code: 'EMAIL_ACCOUNT_NOT_FOUND' });
    if (account.verificationStatus === 'verified') {
      return res.status(409).json({ success: false, message: 'This Gmail account is already verified.', code: 'ACCOUNT_ALREADY_VERIFIED' });
    }
    const now = new Date();
    if (!account.otpExpiresAt || account.otpExpiresAt <= now) {
      await EmailAccount.updateOne({ ...query, verificationStatus: 'pending', otpHash: account.otpHash || null }, {
        $set: { verificationStatus: 'expired', otpAttempts: 0 },
        $unset: { otpHash: '', otpSalt: '', otpExpiresAt: '' },
      });
      return res.status(410).json({ success: false, message: 'This verification code has expired. Request a new one.', code: 'OTP_EXPIRED' });
    }
    if (!account.otpHash || !account.otpSalt) {
      return res.status(400).json({ success: false, message: 'No active verification code exists. Request a new one.', code: 'OTP_NOT_ISSUED' });
    }

    if (await verifyOtp(otp, account.otpSalt, account.otpHash)) {
      const verified = await EmailAccount.findOneAndUpdate(
        { ...query, verificationStatus: 'pending', otpHash: account.otpHash, otpExpiresAt: { $gt: now }, otpAttempts: { $lt: OTP_MAX_ATTEMPTS } },
        {
          $set: { verificationStatus: 'verified', verifiedAt: now, otpAttempts: 0 },
          $unset: {
            otpHash: '',
            otpSalt: '',
            otpExpiresAt: '',
            otpLastSentAt: '',
            otpResendCount: '',
            otpResendWindowStartedAt: '',
          },
        },
        { new: true },
      );
      if (verified) return res.json({ success: true, data: safe(verified) });
      const latest = await EmailAccount.findOne(query);
      if (latest?.verificationStatus === 'verified') {
        return res.status(409).json({ success: false, message: 'This verification code has already been used.', code: 'OTP_REPLAYED' });
      }
      return res.status(409).json({ success: false, message: 'The verification code changed. Request the latest code and try again.', code: 'OTP_REPLAYED' });
    }

    const attempted = await EmailAccount.findOneAndUpdate(
      { ...query, verificationStatus: 'pending', otpHash: account.otpHash, otpExpiresAt: { $gt: now }, otpAttempts: { $lt: OTP_MAX_ATTEMPTS } },
      { $inc: { otpAttempts: 1 } },
      { new: true },
    );
    if (!attempted) {
      return res.status(409).json({ success: false, message: 'The verification code is no longer active. Request a new one.', code: 'OTP_NOT_ACTIVE' });
    }
    const attemptsRemaining = Math.max(0, OTP_MAX_ATTEMPTS - attempted.otpAttempts);
    if (attemptsRemaining === 0) {
      await EmailAccount.updateOne({ ...query, verificationStatus: 'pending', otpAttempts: { $gte: OTP_MAX_ATTEMPTS } }, {
        $set: { verificationStatus: 'expired', otpAttempts: 0 },
        $unset: { otpHash: '', otpSalt: '', otpExpiresAt: '' },
      });
      return res.status(429).json({ success: false, message: 'Too many incorrect codes. Request a new verification email.', code: 'OTP_ATTEMPTS_EXHAUSTED', attemptsRemaining: 0 });
    }
    return res.status(400).json({
      success: false,
      message: 'That verification code is incorrect.',
      code: 'OTP_INCORRECT',
      data: { attemptsRemaining },
    });
  } catch (error) {
    next(error);
  }
}

async function resendEmailAccountOtp(req, res, next) {
  try {
    const account = await issueVerificationOtp(req.params.id, req.user._id);
    return res.json({ success: true, data: safe(account) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Unable to send a verification email.',
      code: error.code || 'OTP_RESEND_FAILED',
    });
  }
}

async function sendWithAccount(account, payload) {
  if (account.provider === 'gmail' && account.verificationStatus !== 'verified' && payload.purpose !== 'account-verification') {
    throw Object.assign(new Error('Verify this Gmail account before sending email.'), { statusCode: 403, code: 'EMAIL_ACCOUNT_UNVERIFIED' });
  }
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
    {
      $set: {
        displayName: 'Reconnect required · ' + (new Date()).toISOString().slice(0, 10),
        verificationStatus: 'expired',
        connectionStatus: 'reconnect_required',
        verifiedAt: null,
      },
      $unset: { otpHash: '', otpSalt: '', otpExpiresAt: '' },
    },
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
  verifyEmailAccount,
  resendEmailAccountOtp,
  issueVerificationOtp,
  sendWithAccount,
  markAccountReconnectRequired,
};
