const express = require('express');
const { login, register, me } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', requireAuth, me);

module.exports = router;
