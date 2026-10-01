const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOtp, hashOtp, verifyOtp } = require('../src/utils/email-otp');

test('generates six-digit OTPs including leading zeroes', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateOtp(), /^\d{6}$/);
  }
});

test('stores a salted hash and verifies only the matching OTP', async () => {
  const otp = '004281';
  const stored = await hashOtp(otp);
  assert.notEqual(stored.hash, otp);
  assert.notEqual(stored.salt, '');
  assert.equal(await verifyOtp(otp, stored.salt, stored.hash), true);
  assert.equal(await verifyOtp('004282', stored.salt, stored.hash), false);
});