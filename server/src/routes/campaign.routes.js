const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  createCampaign,
  listCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignStats,
  validateRecipients,
  uploadRecipients,
} = require('../controllers/campaign.controller');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(requireAuth);

router.post('/', createCampaign);
router.post('/recipients/validate', upload.single('file'), validateRecipients);
router.get('/', listCampaigns);
router.get('/:id', getCampaignById);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.get('/:id/stats', getCampaignStats);
router.post('/:id/start', startCampaign);
router.post('/:id/pause', pauseCampaign);
router.post('/:id/resume', resumeCampaign);
router.post('/:id/cancel', cancelCampaign);
router.post('/:id/recipients/upload', upload.single('file'), uploadRecipients);

module.exports = router;
