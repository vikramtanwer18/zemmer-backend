const express = require('express');
const {
    createStaffMember,
    getStaffMembers,
    getStaffMemberById,
    updateStaffMember,
    deleteStaffMember,
} = require('../controllers/staffMemberController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { enforcePlanLimit } = require('../middlewares/planLimitGuard');
const { validateStaffMember, validateStaffMemberUpdate } = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, enforcePlanLimit('staff'), authorize('OWNER'), validateStaffMember, createStaffMember);
router.get('/', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), getStaffMembers);
router.get('/:id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), getStaffMemberById);
router.patch('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), validateStaffMemberUpdate, updateStaffMember);
router.delete('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), deleteStaffMember);

module.exports = router;
