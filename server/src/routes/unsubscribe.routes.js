const express = require('express');
const { unsubscribeUser } = require('../controllers/unsubscribe.controller');

const router = express.Router();

router.get('/unsubscribe/:token', unsubscribeUser);

module.exports = router;
