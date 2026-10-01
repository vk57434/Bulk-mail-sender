const crypto = require('crypto');
const config = require('../config/env');
function key() { if (!config.credentialEncryptionKey) throw new Error('Credential encryption is not configured'); return crypto.createHash('sha256').update(config.credentialEncryptionKey).digest(); }
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.'); }
function decrypt(value) { const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64')); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')); }
module.exports = { encrypt, decrypt };
