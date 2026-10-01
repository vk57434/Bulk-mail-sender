const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  generateEventsToken,
  streamCampaignEvents,
} = require('../controllers/campaign-events.controller');

const router = express.Router();

router.post('/:campaignId/events-token', requireAuth, generateEventsToken);
router.get('/:campaignId/events', streamCampaignEvents);

module.exports = router;
