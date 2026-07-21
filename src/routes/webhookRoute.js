const express = require('express');
const { handleRazorpayWebhook } = require('../controllers/webhookController');

const router = express.Router();

// Razorpay webhook endpoint (no authentication required - Razorpay validates signature)
router.post('/razorpay', handleRazorpayWebhook);

module.exports = router;
