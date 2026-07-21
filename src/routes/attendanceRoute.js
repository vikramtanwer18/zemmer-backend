const express = require('express');
const {
    generateQrToken,
    checkInWithQr,
    checkInManual,
    checkOut,
    getAttendances,
    getAttendanceById,
    selfGenerateQr,
    selfCheckIn,
    selfCheckOut,
    getMyAttendance,
} = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { validateQrCheckin, validateManualCheckin } = require('../middlewares/validation');

const router = express.Router();

// --- Member-self routes (logged-in MEMBER acts on their own attendance) ---
router.get('/me', authenticate, requireActiveSubscription, authorize('MEMBER'), getMyAttendance);
router.get('/me/qr', authenticate, requireActiveSubscription, authorize('MEMBER'), selfGenerateQr);
router.post('/me/checkin', authenticate, requireActiveSubscription, authorize('MEMBER'), selfCheckIn);
router.post('/me/checkout', authenticate, requireActiveSubscription, authorize('MEMBER'), selfCheckOut);

// --- Staff routes (kiosk / front-desk operations on any member) ---
router.get('/qr/:member_id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), generateQrToken);
router.post('/checkin/qr', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateQrCheckin, checkInWithQr);
router.post('/checkin/manual', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateManualCheckin, checkInManual);
router.post('/:id/checkout', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), checkOut);

router.get('/', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), getAttendances);
router.get('/:id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), getAttendanceById);

module.exports = router;
