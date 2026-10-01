// Verification script for CREDENTIAL_ENCRYPTION_KEY
// Usage: node scripts/verify-encryption.js

const path = require('path');

// Load dotenv first before any other imports
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('=== MailFlow Encryption Configuration Verification ===\n');

// Check if the environment variable is set
const key = process.env.CREDENTIAL_ENCRYPTION_KEY;

if (!key) {
  console.error('ERROR: CREDENTIAL_ENCRYPTION_KEY is not set in .env file');
  process.exit(1);
}

if (key.trim().length === 0) {
  console.error('ERROR: CREDENTIAL_ENCRYPTION_KEY is empty');
  process.exit(1);
}

console.log('Key length:', key.length, 'characters');
console.log('Key format: hex string');

// Validate hex format
const hexRegex = /^[a-fA-F0-9]+$/;
if (!hexRegex.test(key)) {
  console.error('ERROR: Key contains non-hex characters');
  process.exit(1);
}

// Check key length (64 hex chars = 32 bytes = 256 bits for AES-256)
if (key.length !== 64) {
  console.warn('WARNING: Key is not 64 hex characters (32 bytes)');
  console.warn('Expected: 64 characters for AES-256-GCM');
  console.warn('Your key has', key.length, 'characters');
} else {
  console.log('Key length is correct for AES-256-GCM (32 bytes)');
}

// Now try to load the actual config module to verify it works
try {
  console.log('\nTesting config module...');
  const config = require('../src/config/env');
  
  if (config.credentialEncryptionKey) {
    console.log('SUCCESS: Config loaded and credentialEncryptionKey is set');
  } else {
    console.error('ERROR: Config loaded but credentialEncryptionKey is empty');
    process.exit(1);
  }
  
  // Test actual encryption
  console.log('\nTesting encryption/decryption...');
  const { encrypt, decrypt } = require('../src/utils/credentials');
  
  const testData = { accessToken: 'test_token_123', refreshToken: 'refresh_456' };
  console.log('Original data:', JSON.stringify(testData));
  
  const encrypted = encrypt(testData);
  console.log('Encrypted successfully');
  console.log('Encrypted format:', encrypted.substring(0, 50) + '...');
  
  const decrypted = decrypt(encrypted);
  console.log('Decrypted data:', JSON.stringify(decrypted));
  
  if (JSON.stringify(testData) === JSON.stringify(decrypted)) {
    console.log('\n=== ALL TESTS PASSED ===');
    console.log('Your CREDENTIAL_ENCRYPTION_KEY is correctly configured.');
    console.log('You can now use Gmail OAuth safely.');
  } else {
    console.error('\nERROR: Decrypted data does not match original');
    process.exit(1);
  }
  
} catch (error) {
  console.error('\nERROR during testing:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
