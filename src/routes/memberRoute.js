const express = require('express');
const {
    registerMember,
    getMembers,
    getMemberById,
    updateMember,
    deleteMember,
} = require('../controllers/memberController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { enforcePlanLimit } = require('../middlewares/planLimitGuard');
const { validateMember, validateMemberUpdate } = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, enforcePlanLimit('member'), authorize('OWNER', 'TRAINER'), validateMember, registerMember);
router.get('/', authenticate, requireActiveSubscription, getMembers);
router.get('/:id', authenticate, requireActiveSubscription, getMemberById);
router.patch('/:id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateMemberUpdate, updateMember);
router.delete('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), deleteMember);

module.exports = router;
