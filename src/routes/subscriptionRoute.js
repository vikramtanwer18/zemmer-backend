const express = require('express');
const { getMySubscription, initiateUpgrade, handleUpgradePaymentSuccess } = require('../controllers/subscriptionController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');

const router = express.Router();

// Get current subscription
router.get(
    '/me',
    authenticate,
    authorize('OWNER', 'TRAINER', 'COACH', 'MEMBER'),
    getMySubscription
);

// Initiate upgrade to PRO/ELITE (requires active subscription)
router.post(
    '/upgrade',
    authenticate,
    requireActiveSubscription,
    authorize('OWNER'),
    initiateUpgrade
);

// Handle successful upgrade payment
router.post(
    '/upgrade/confirm',
    authenticate,
    authorize('OWNER'),
    handleUpgradePaymentSuccess
);

module.exports = router;
