const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  list,
  configStatus,
  create,
  test,
  remove,
  setDefault,
  gmailConnect,
  gmailCallback,
} = require('../controllers/email-account.controller');

const router = express.Router();

router.get('/gmail/callback', gmailCallback);
router.use(requireAuth);
router.get('/', list);
router.get('/config', configStatus);
router.get('/gmail/connect', gmailConnect);
router.post('/', create);
router.post('/:id/test', test);
router.delete('/:id', remove);
router.put('/:id/default', setDefault);

module.exports = router;
