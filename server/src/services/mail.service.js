const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../config/env');

function buildTransport() {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    throw new Error('SMTP configuration is missing. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  });
}

async function verifySMTPConnection() {
  try {
    const transporter = buildTransport();
    await transporter.verify();
    logger.info('SMTP verified successfully');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'SMTP verification failed');
    return false;
  }
}

async function sendMail({ to, subject, html, text, from = config.smtpFrom }) {
  try {
    const transporter = buildTransport();
    const response = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
    });

    logger.info({ messageId: response.messageId, to }, 'Email submitted to SMTP provider');
    return response;
  } catch (error) {
    logger.error({ err: error, to }, 'Email send failed');
    throw error;
  }
}

module.exports = {
  buildTransport,
  verifySMTPConnection,
  sendMail,
};
