const express = require('express');
const {
    getOverview,
    getMemberAnalytics,
    getRevenueAnalytics,
    getAttendanceAnalytics,
    getLeadAnalytics,
    getClassAnalytics,
} = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');

const router = express.Router();

router.get('/overview', authenticate, requireActiveSubscription, authorize('OWNER'), getOverview);
router.get('/members', authenticate, requireActiveSubscription, authorize('OWNER'), getMemberAnalytics);
router.get('/revenue', authenticate, requireActiveSubscription, authorize('OWNER'), getRevenueAnalytics);
router.get('/attendance', authenticate, requireActiveSubscription, authorize('OWNER'), getAttendanceAnalytics);
router.get('/leads', authenticate, requireActiveSubscription, authorize('OWNER'), getLeadAnalytics);
router.get('/classes', authenticate, requireActiveSubscription, authorize('OWNER'), getClassAnalytics);

module.exports = router;
