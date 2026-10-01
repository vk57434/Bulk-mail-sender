const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth.middleware');
const {
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
} = require('../controllers/email-account.controller');

const router = express.Router();

router.get('/gmail/callback', gmailCallback);
router.use(requireAuth);
const verificationAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Wait 15 minutes and try again.', code: 'OTP_RATE_LIMIT' },
});
const verificationResendLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification emails requested. Wait 15 minutes and try again.', code: 'OTP_RESEND_RATE_LIMIT' },
});
router.get('/', list);
router.get('/config', configStatus);
router.get('/gmail/connect', gmailConnect);
router.post('/', create);
router.post('/:id/test', test);
router.post('/:id/verification/verify', verificationAttemptLimit, verifyEmailAccount);
router.post('/:id/verification/resend', verificationResendLimit, resendEmailAccountOtp);
router.delete('/:id', remove);
router.put('/:id/default', setDefault);

module.exports = router;
