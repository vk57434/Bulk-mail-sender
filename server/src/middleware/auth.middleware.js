const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const config = require('../config/env');
const logger = require('../utils/logger');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    const admin = await User.findById(decoded.id).lean() || await Admin.findById(decoded.id).lean();

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    req.user = admin;
    next();
  } catch (error) {
    logger.warn({ err: error }, 'Authentication failed');
    return res.status(401).json({ success: false, message: 'Invalid or expired token', code: 'AUTH_FAILED' });
  }
}

module.exports = { requireAuth };
