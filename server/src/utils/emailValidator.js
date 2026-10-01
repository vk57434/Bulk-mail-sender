const validator = require('validator');

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return validator.isEmail(normalized, {
    allow_display_name: false,
    require_tld: true,
  });
}

module.exports = {
  normalizeEmail,
  isValidEmail,
};
