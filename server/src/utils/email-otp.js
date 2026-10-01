const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function hashOtp(otp, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(String(otp), salt, 64);
  return { salt, hash: hash.toString('hex') };
}

async function verifyOtp(otp, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = await scrypt(String(otp), salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { generateOtp, hashOtp, verifyOtp };