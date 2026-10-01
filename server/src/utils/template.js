function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replaceTemplateVariables(template, data = {}) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    const value = data[key];
    if (value === undefined || value === null) {
      return '';
    }
    return escapeHtml(String(value));
  });
}

function generateUnsubscribeToken(email, jwtSecret) {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ email, type: 'unsubscribe' }, jwtSecret, { expiresIn: '365d' });
}

module.exports = {
  escapeHtml,
  replaceTemplateVariables,
  generateUnsubscribeToken,
};
