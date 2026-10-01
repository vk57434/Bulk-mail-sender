const jwt = require('jsonwebtoken');
const Suppression = require('../models/Suppression');
const config = require('../config/env');
const logger = require('../utils/logger');

async function unsubscribeUser(req, res) {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, config.jwtSecret);

    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Invalid unsubscribe token', code: 'INVALID_UNSUBSCRIBE_TOKEN' });
    }

    await Suppression.findOneAndUpdate(
      { email },
      { $set: { email, reason: 'unsubscribe' } },
      { upsert: true, new: true },
    );

    logger.info({ email }, 'User unsubscribed');

    return res.status(200).send(`
      <html>
        <head><title>Unsubscribed</title></head>
        <body>
          <h2>You have been unsubscribed.</h2>
          <p>You will no longer receive future email campaigns from this system.</p>
        </body>
      </html>
    `);
  } catch (error) {
    logger.warn({ err: error }, 'Unsubscribe token validation failed');
    return res.status(400).json({ success: false, message: 'Invalid or expired unsubscribe token', code: 'INVALID_UNSUBSCRIBE_TOKEN' });
  }
}

module.exports = { unsubscribeUser };
