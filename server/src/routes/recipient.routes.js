const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const { getCampaignRecipients } = require('../controllers/recipient.controller');
const { uploadRecipients } = require('../controllers/campaign.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/:id/recipients', getCampaignRecipients);
router.post('/:id/recipients/upload', upload.single('file'), uploadRecipients);

module.exports = router;
