const express = require('express');
const {
    createMembership,
    getMemberships,
    getMembershipById,
    updateMembership,
    deleteMembership,
    freezeMembership,
    unfreezeMembership,
} = require('../controllers/MembershipController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const {
    validateMembership,
    validateMembershipUpdate,
    validateFreeze,
} = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateMembership, createMembership);
router.get('/', authenticate, requireActiveSubscription, getMemberships);
router.get('/:id', authenticate, requireActiveSubscription, getMembershipById);
router.patch('/:id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateMembershipUpdate, updateMembership);
router.delete('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), deleteMembership);

router.post('/:id/freeze', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateFreeze, freezeMembership);
router.post('/:id/unfreeze', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), unfreezeMembership);

module.exports = router;
