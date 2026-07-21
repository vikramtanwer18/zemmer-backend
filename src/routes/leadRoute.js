const express = require('express');
const {
    createLead,
    getLeads,
    getLeadById,
    updateLead,
    changeLeadStage,
    deleteLead,
    addLeadActivity,
    getLeadActivities,
    createFollowup,
    getUpcomingFollowups,
    updateFollowup,
    deleteFollowup,
    convertLeadToMember,
} = require('../controllers/leadController');
const { authenticate, authorize } = require('../middlewares/authorization');
const { requireActiveSubscription, requireFeature } = require('../middlewares/subscriptionGuard');
const {
    validateLead,
    validateLeadUpdate,
    validateLeadStageChange,
    validateLeadActivity,
    validateLeadFollowup,
    validateLeadFollowupUpdate,
    validateLeadConvert,
} = require('../middlewares/validation');

const router = express.Router();

router.get('/followups/upcoming', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), getUpcomingFollowups);
router.patch('/followups/:followupId', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), validateLeadFollowupUpdate, updateFollowup);
router.delete('/followups/:followupId', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), deleteFollowup);

router.post('/', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLead, createLead);
router.get('/', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), getLeads);
router.get('/:id', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), getLeadById);
router.patch('/:id', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLeadUpdate, updateLead);
router.delete('/:id', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER'), deleteLead);

router.patch('/:id/stage', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLeadStageChange, changeLeadStage);
router.post('/:id/convert', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLeadConvert, convertLeadToMember);

router.get('/:id/activities', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), getLeadActivities);
router.post('/:id/activities', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLeadActivity, addLeadActivity);

router.post('/:id/followups', authenticate, requireActiveSubscription, requireFeature('lead_pipeline'), authorize('OWNER', 'TRAINER'), validateLeadFollowup, createFollowup);

module.exports = router;
