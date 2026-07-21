const express = require('express');
const {
    createPlan,
    getPlans,
    getPlanById,
    updatePlan,
    deletePlan,
} = require('../controllers/planController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription } = require('../middlewares/subscriptionGuard');
const { validatePlan, validatePlanUpdate } = require('../middlewares/validation');

const router = express.Router();

router.post('/', authenticate, requireActiveSubscription, authorize('OWNER'), validatePlan, createPlan);
router.get('/', authenticate, requireActiveSubscription, getPlans);
router.get('/:id', authenticate, requireActiveSubscription, getPlanById);
router.patch('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), validatePlanUpdate, updatePlan);
router.delete('/:id', authenticate, requireActiveSubscription, authorize('OWNER'), deletePlan);

module.exports = router;
