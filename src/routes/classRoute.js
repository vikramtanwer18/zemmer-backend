const express = require('express');
const {
    createClass,
    getClasses,
    getClassById,
    updateClass,
    deleteClass,
} = require('../controllers/classController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { enforcePlanLimit } = require('../middlewares/planLimitGuard');
const { validateClass, validateClassUpdate } = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, enforcePlanLimit('class'), authorize('OWNER', 'TRAINER'), validateClass, createClass);
router.get('/', authenticate, requireActiveSubscription, getClasses);
router.get('/:id', authenticate, requireActiveSubscription, getClassById);
router.patch('/:id', authenticate, requireActiveSubscription, authorize('OWNER', 'TRAINER'), validateClassUpdate, updateClass);
router.delete('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), deleteClass);

module.exports = router;
