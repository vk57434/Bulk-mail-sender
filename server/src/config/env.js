const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY.trim().length === 0) {
  throw new Error(
    'FATAL: CREDENTIAL_ENCRYPTION_KEY is not configured. ' +
    'Gmail OAuth requires credential encryption. ' +
    'Set a secure 32-byte key in your .env file: CREDENTIAL_ENCRYPTION_KEY=your_hex_key'
  );
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bulk_mail',
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  redisPassword: process.env.REDIS_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'development_secret_replace_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'no-reply@example.com',
  emailRateLimitMs: Number(process.env.EMAIL_RATE_LIMIT_MS || 10000),
  maxRecipientsPerCampaign: Number(process.env.MAX_RECIPIENTS_PER_CAMPAIGN || 10000),
  maxCsvSizeMb: Number(process.env.MAX_CSV_SIZE_MB || 10),
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
};

module.exports = config;
