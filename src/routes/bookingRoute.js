const express = require('express');
const {
    createBooking,
    getBookings,
    getBookingById,
    cancelBooking,
} = require('../controllers/bookingController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { validateBooking } = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateBooking, createBooking);
router.get('/', authenticate, requireActiveSubscription, getBookings);
router.get('/:id', authenticate, requireActiveSubscription, getBookingById);
router.post('/:id/cancel', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), cancelBooking);

module.exports = router;
