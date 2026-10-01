const { getRecipientsByCampaign } = require('../services/recipient.service');
const logger = require('../utils/logger');

async function getCampaignRecipients(req, res, next) {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 50 } = req.query;
    const result = await getRecipientsByCampaign(id, { status, page, limit });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch campaign recipients');
    next(error);
  }
}

module.exports = { getCampaignRecipients };
