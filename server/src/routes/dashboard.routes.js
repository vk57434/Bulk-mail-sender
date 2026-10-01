const { Router } = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { getDashboardStats, getRecentActivity } = require('../controllers/dashboard.controller');

const router = Router();

// All dashboard routes require authentication
router.get('/stats', requireAuth, getDashboardStats);
router.get('/activity', requireAuth, getRecentActivity);

module.exports = router;
