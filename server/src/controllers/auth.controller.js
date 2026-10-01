const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const config = require('../config/env');
const logger = require('../utils/logger');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required', code: 'MISSING_CREDENTIALS' });
    }

    const admin = await User.findOne({ email: String(email).trim().toLowerCase() }) || await Admin.findOne({ email: String(email).trim().toLowerCase() });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const token = jwt.sign({ id: admin._id.toString(), email: admin.email }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    logger.info({ email: admin.email }, 'Admin logged in');

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: admin._id,
          name: admin.name || admin.email.split('@')[0],
          email: admin.email,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) { try { const { name, email, password } = req.body; if (!name || !email || !password || password.length < 8) return res.status(400).json({ success: false, message: 'Name, valid email, and an 8-character password are required' }); const normalized = String(email).trim().toLowerCase(); if (await User.findOne({ email: normalized }) || await Admin.findOne({ email: normalized })) return res.status(409).json({ success: false, message: 'An account already exists for this email' }); const user = await User.create({ name, email: normalized, passwordHash: await bcrypt.hash(password, 10) }); const token = jwt.sign({ id: user._id.toString(), email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn }); return res.status(201).json({ success: true, data: { token, user: { id: user._id, name: user.name, email: user.email } } }); } catch (error) { next(error); } }
async function me(req, res) { return res.json({ success: true, data: { id: req.user._id, name: req.user.name || req.user.email.split('@')[0], email: req.user.email } }); }

module.exports = { login, register, me };
