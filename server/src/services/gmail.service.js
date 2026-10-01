const { google } = require('googleapis');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
];

function isConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);
}

function buildOAuth2Client() {
  if (!isConfigured()) {
    throw Object.assign(new Error('Gmail OAuth is not configured on this server yet.'), {
      statusCode: 501,
      code: 'GMAIL_OAUTH_NOT_CONFIGURED',
    });
  }
  return new google.auth.OAuth2(config.googleClientId, config.googleClientSecret, config.googleRedirectUri);
}

function generateState() {
  return crypto.randomBytes(24).toString('hex');
}

function buildAuthUrl(state) {
  const oauth2Client = buildOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: REQUIRED_SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = buildOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens || !tokens.access_token) {
    throw Object.assign(new Error('Google did not return an access token.'), { code: 'NO_ACCESS_TOKEN' });
  }
  return tokens;
}

async function fetchUserProfile(tokens) {
  const oauth2Client = buildOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
  const { data } = await oauth2.userinfo.get();
  if (!data || !data.email) {
    throw Object.assign(new Error('Unable to read the Gmail account profile.'), { code: 'NO_PROFILE_EMAIL' });
  }
  return {
    email: String(data.email).toLowerCase().trim(),
    displayName: String(data.name || data.email || '').trim(),
    verifiedEmail: data.verified_email === true,
  };
}

async function refreshAccessTokenIfNeeded(credentials) {
  const now = Date.now();
  const hasAccessToken = Boolean(credentials && credentials.access_token);
  const hasExpiry = typeof credentials.expiry_date === 'number';
  const expired = !hasExpiry || now >= credentials.expiry_date - 60 * 1000;
  if (hasAccessToken && !expired) {
    return { credentials, refreshed: false };
  }
  if (!credentials || !credentials.refresh_token) {
    throw Object.assign(new Error('Gmail account needs to be re-connected (missing refresh token).'), {
      code: 'NO_REFRESH_TOKEN',
      reconnectRequired: true,
    });
  }
  const oauth2Client = buildOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: credentials.refresh_token });
  let refreshedTokens;
  try {
    refreshedTokens = await oauth2Client.refreshAccessToken();
  } catch (error) {
    const safe = String(error.message || error.response?.data?.error_description || 'Refresh failed');
    if (/invalid_grant|token.*revoked|refresh token.*invalid/i.test(safe)) {
      throw Object.assign(new Error('Gmail authentication expired. Please reconnect your Gmail account.'), {
        code: 'REFRESH_INVALID_GRANT',
        reconnectRequired: true,
      });
    }
    throw Object.assign(new Error(`Gmail token refresh failed: ${safe.slice(0, 200)}`), {
      code: 'REFRESH_FAILED',
    });
  }
  const next = {
    ...credentials,
    access_token: refreshedTokens.credentials.access_token,
    expiry_date: refreshedTokens.credentials.expiry_date || now + (Number(refreshedTokens.credentials.expires_in || 3599) * 1000),
    scope: refreshedTokens.credentials.scope || credentials.scope,
    token_type: refreshedTokens.credentials.token_type || credentials.token_type || 'Bearer',
  };
  return { credentials: next, refreshed: true };
}

function encodeEmailMessage({ from, to, cc = [], bcc = [], replyTo, subject, html, text }) {
  const headers = [];
  headers.push(`From: ${from}`);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean));
  if (to.length) headers.push(`To: ${list(to).join(', ')}`);
  if (cc.length) headers.push(`Cc: ${list(cc).join(', ')}`);
  if (bcc.length) headers.push(`Bcc: ${list(bcc).join(', ')}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  const subjectEncoded = `=?utf-8?B?${Buffer.from(subject || '', 'utf8').toString('base64')}?=`;
  headers.push(`Subject: ${subjectEncoded}`);
  headers.push('MIME-Version: 1.0');
  const boundary = `_mailflow_boundary_${crypto.randomBytes(8).toString('hex')}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = text
    ? [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        String(text),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        String(html || '').replace(/\r?\n/g, '\r\n'),
        `--${boundary}--`,
      ].join('\r\n')
    : [
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        String(html || '').replace(/\r?\n/g, '\r\n'),
        `--${boundary}--`,
      ].join('\r\n');
  const rawMessage = [...headers, '', body].join('\r\n');
  return Buffer.from(rawMessage, 'utf8').toString('base64url');
}

async function sendGmailMessage({ credentials, from, to, cc = [], bcc = [], subject, html, text }) {
  const { credentials: activeCredentials, refreshed } = await refreshAccessTokenIfNeeded(credentials);
  const oauth2Client = buildOAuth2Client();
  oauth2Client.setCredentials(activeCredentials);
  const gmail = google.gmail({ auth: oauth2Client, version: 'v1' });
  const raw = encodeEmailMessage({ from, to, cc, bcc, subject, html, text });
  let response;
  try {
    response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  } catch (error) {
    const errorPayload = error.response?.data?.error || error;
    const statusCode = error.response?.status || errorPayload?.code || error.code;
    const message = String(errorPayload?.message || error.message || 'Gmail API send failed');
    const safe = message.slice(0, 300);
    let reconnectRequired = false;
    if (/invalid_grant|invalid credentials|auth error|login required|request had invalid authentication/i.test(safe) || [401, 403].includes(Number(statusCode))) {
      reconnectRequired = true;
    }
    throw Object.assign(new Error(safe), {
      code: 'GMAIL_API_ERROR',
      statusCode: Number(statusCode) || 500,
      reconnectRequired,
      deliveryOutcome: error.response && Number(statusCode) < 500 ? 'not_sent' : 'unknown',
    });
  }
  const messageId = String(response?.data?.id || crypto.randomBytes(12).toString('hex'));
  logger.info({ provider: 'gmail', from, to, messageId }, 'Email submitted to Gmail API');
  return {
    provider: 'gmail',
    messageId,
    accepted: [from, ...to, ...cc, ...bcc].filter(Boolean),
    rejected: [],
    refreshed,
    credentials: refreshed ? activeCredentials : null,
    gmailResponse: response?.data || null,
  };
}

module.exports = {
  isConfigured,
  buildOAuth2Client,
  generateState,
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchUserProfile,
  refreshAccessTokenIfNeeded,
  sendGmailMessage,
  encodeEmailMessage,
};
