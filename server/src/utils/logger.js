const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['password', 'smtpPass', 'jwtSecret', 'authorization', 'token', 'headers.authorization'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
