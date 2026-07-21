const joi = require('joi');

const MEMBER_STATUSES = ['ACTIVE', 'SUSPENDED', 'CHURNED','LEAD'];

async function validateRegistration(req, res, next) {
    const schema = joi.object({
        gymName: joi.string().min(2).max(100).required(),
        ownerName: joi.string().min(2).max(100).required(),
        ownerEmail: joi.string().email().required(),
        password: joi.string().min(8).required(),
        confirmPassword: joi.string().valid(joi.ref('password')).required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateMember(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100).required(),
        phone: joi.string().pattern(/^[0-9]{10}$/).required(),
        email: joi.string().email().required(),
        dob: joi.date().iso().less('now').allow(null),
        gender: joi.string().valid('MALE', 'FEMALE', 'OTHERS').required(),
        notes: joi.string().max(2000).allow(null, ''),
        status: joi.string().valid(...MEMBER_STATUSES).default('ACTIVE'),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateMemberUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100),
        phone: joi.string().pattern(/^[0-9]{10}$/),
        email: joi.string().email().allow(null, ''),
        dob: joi.date().iso().less('now').allow(null),
        gender: joi.string().valid('MALE', 'FEMALE', 'OTHERS'),
        notes: joi.string().max(2000).allow(null, ''),
        status: joi.string().valid(...MEMBER_STATUSES),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validatePlan(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100).required(),
        price: joi.number().integer().min(0).required(),
        duration_days: joi.number().integer().min(1).required(),
        description: joi.string().max(500).allow(null, ''),
        max_freeze_days: joi.number().integer().min(0).default(0),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validatePlanUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100),
        price: joi.number().integer().min(0),
        duration_days: joi.number().integer().min(1),
        description: joi.string().max(500).allow(null, ''),
        max_freeze_days: joi.number().integer().min(0),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const MSHIP_STATUSES = ['ACTIVE', 'FROZEN', 'EXPIRED', 'SUSPENDED'];

async function validateMembership(req, res, next) {
    const schema = joi.object({
        member_id: joi.string().uuid().required(),
        plan_id: joi.string().uuid().required(),
        start_date: joi.date().iso(),
        status: joi.string().valid(...MSHIP_STATUSES).default('ACTIVE'),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateMembershipUpdate(req, res, next) {
    const schema = joi.object({
        plan_id: joi.string().uuid(),
        start_date: joi.date().iso(),
        end_date: joi.date().iso(),
        status: joi.string().valid(...MSHIP_STATUSES),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateFreeze(req, res, next) {
    const schema = joi.object({
        from_date: joi.date().iso(),
        duration_days: joi.number().integer().min(1).max(365).required(),
        reason: joi.string().max(500).allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const ATTENDANCE_METHODS = ['QR', 'MANUAL', 'BIOMETRIC'];

async function validateQrCheckin(req, res, next) {
    const schema = joi.object({
        qrToken: joi.string().required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateManualCheckin(req, res, next) {
    const schema = joi.object({
        member_id: joi.string().uuid().required(),
        method: joi.string().valid('MANUAL', 'BIOMETRIC').default('MANUAL'),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const SEX_VALUES = ['MALE', 'FEMALE', 'OTHERS'];
const STAFF_ROLES = ['TRAINER', 'COACH'];

async function validateStaffMember(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100).required(),
        email: joi.string().email().required(),
        phone: joi.string().pattern(/^[0-9]{10}$/).required(),
        address: joi.string().min(2).max(255).required(),
        dob: joi.date().iso().less('now').required(),
        sex: joi.string().valid(...SEX_VALUES).required(),
        role: joi.string().valid(...STAFF_ROLES).required(),
        hourlyPrice: joi.number().integer().min(0).required(),
        bio: joi.string().max(1000).allow(null, ''),
        certificate: joi.string().uri().allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateStaffMemberUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100),
        email: joi.string().email(),
        phone: joi.string().pattern(/^[0-9]{10}$/),
        address: joi.string().min(2).max(255),
        dob: joi.date().iso().less('now'),
        sex: joi.string().valid(...SEX_VALUES),
        role: joi.string().valid(...STAFF_ROLES),
        hourlyPrice: joi.number().integer().min(0),
        bio: joi.string().max(1000).allow(null, ''),
        certificate: joi.string().uri().allow(null, ''),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const BOOKING_STATUSES = ['CONFIRMED', 'WAITLISTED', 'CANCELLED'];

async function validateClass(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(120).required(),
        trainer_id: joi.string().uuid().required(),
        starts_at: joi.date().iso().required(),
        ends_at: joi.date().iso().greater(joi.ref('starts_at')).required(),
        capacity: joi.number().integer().min(1).max(10000).required(),
        description: joi.string().max(1000).allow('', null),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateClassUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(120),
        trainer_id: joi.string().uuid(),
        starts_at: joi.date().iso(),
        ends_at: joi.date().iso(),
        capacity: joi.number().integer().min(1).max(10000),
        description: joi.string().max(1000).allow('', null),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateBooking(req, res, next) {
    const schema = joi.object({
        class_id: joi.string().uuid().required(),
        member_id: joi.string().uuid().required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const LEAD_STAGES = ['NEW', 'CONTACTED', 'TRIAL', 'NEGOTIATION', 'WON', 'LOST'];
const LEAD_SOURCES = ['WALK_IN', 'WEBSITE', 'INSTAGRAM', 'REFERRAL'];
const LEAD_ACTIVITY_TYPES = ['NOTE', 'CALL', 'STAGE_CHANGE', 'CONVERTED'];

async function validateLead(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100).required(),
        phone: joi.string().pattern(/^[0-9]{10}$/).required(),
        email: joi.string().email().allow(null, ''),
        source: joi.string().valid(...LEAD_SOURCES).required(),
        stage: joi.string().valid(...LEAD_STAGES).default('NEW'),
        assignedTo: joi.string().uuid().allow(null, ''),
        notes: joi.string().max(2000).allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(100),
        phone: joi.string().pattern(/^[0-9]{10}$/),
        email: joi.string().email().allow(null, ''),
        source: joi.string().valid(...LEAD_SOURCES),
        assignedTo: joi.string().uuid().allow(null, ''),
        notes: joi.string().max(2000).allow(null, ''),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadStageChange(req, res, next) {
    const schema = joi.object({
        stage: joi.string().valid(...LEAD_STAGES).required(),
        note: joi.string().max(500).allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadActivity(req, res, next) {
    const schema = joi.object({
        type: joi.string().valid(...LEAD_ACTIVITY_TYPES).required(),
        payload: joi.object().default({}),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadFollowup(req, res, next) {
    const schema = joi.object({
        followup_at: joi.date().iso().greater('now').required(),
        note: joi.string().max(500).allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadFollowupUpdate(req, res, next) {
    const schema = joi.object({
        followup_at: joi.date().iso(),
        is_done: joi.boolean(),
        note: joi.string().max(500).allow(null, ''),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateLeadConvert(req, res, next) {
    const schema = joi.object({
        dob: joi.date().iso().less('now').allow(null),
        gender: joi.string().valid('MALE', 'FEMALE', 'OTHERS').required(),
        notes: joi.string().max(2000).allow(null, ''),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateEmailOnly(req, res, next) {
    const schema = joi.object({
        email: joi.string().email().required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateResetPassword(req, res, next) {
    const schema = joi.object({
        email: joi.string().email().required(),
        otp: joi.string().length(6).pattern(/^[0-9]+$/).required(),
        newPassword: joi.string().min(6).required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateGymProfileUpdate(req, res, next) {
    const schema = joi.object({
        name: joi.string().min(2).max(120),
        subdomain: joi.string().min(2).max(60).pattern(/^[a-z0-9-]+$/).allow(null, ''),
        address: joi.string().min(2).max(255),
        city: joi.string().min(2).max(100),
        noOfBranches: joi.number().integer().min(1).max(1000),
        noOfMembers: joi.number().integer().min(0).max(1000000),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validatePasswordUpdate(req, res, next) {
    const schema = joi.object({
        currentPassword: joi.string().min(6).required(),
        newPassword: joi.string().min(6).required(),
        confirmNewPassword: joi.string().valid(joi.ref('newPassword')).required().messages({
            'any.only': 'confirmNewPassword must match newPassword',
        }),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateAdminLogin(req, res, next) {
    const schema = joi.object({
        email: joi.string().email().required(),
        password: joi.string().min(6).required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateAdminOtp(req, res, next) {
    const schema = joi.object({
        email: joi.string().email().required(),
        otp: joi.string().length(6).pattern(/^[0-9]+$/).required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateAdminOtpResend(req, res, next) {
    const schema = joi.object({
        email: joi.string().email().required(),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

const SAAS_PLAN_KEYS = ['TRIAL', 'PRO', 'ELITE'];

async function validateSaasPlan(req, res, next) {
    const schema = joi.object({
        key: joi.string().valid(...SAAS_PLAN_KEYS).required(),
        name: joi.string().min(2).max(100).required(),
        monthlyPricePaise: joi.number().integer().min(0).required(),
        annualPricePaise: joi.number().integer().min(0).required(),
        maxMembers: joi.number().integer().min(-1).required(),
        maxStaffUsers: joi.number().integer().min(-1).required(),
        maxClassesPerMonth: joi.number().integer().min(-1).required(),
        featureFlags: joi.object().default({}),
        rzpPlanIdMonthly: joi.string().optional(),
        rzpPlanIdAnnual: joi.string().optional(),
        isActive: joi.boolean().default(true),
    });
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

async function validateSaasPlanUpdate(req, res, next) {
    const schema = joi.object({
        key: joi.string().valid(...SAAS_PLAN_KEYS),
        name: joi.string().min(2).max(100),
        monthlyPricePaise: joi.number().integer().min(0),
        annualPricePaise: joi.number().integer().min(0),
        maxMembers: joi.number().integer().min(-1),
        maxStaffUsers: joi.number().integer().min(-1),
        maxClassesPerMonth: joi.number().integer().min(-1),
        featureFlags: joi.object(),
        rzpPlanIdMonthly: joi.string().optional(),
        rzpPlanIdAnnual: joi.string().optional(),
        isActive: joi.boolean(),
    }).min(1);
    try {
        req.body = await schema.validateAsync(req.body, { stripUnknown: true });
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    validateRegistration,
    validateMember,
    validateMemberUpdate,
    validatePlan,
    validatePlanUpdate,
    validateMembership,
    validateMembershipUpdate,
    validateFreeze,
    validateQrCheckin,
    validateManualCheckin,
    validateStaffMember,
    validateStaffMemberUpdate,
    validateClass,
    validateClassUpdate,
    validateBooking,
    validateSaasPlan,
    validateSaasPlanUpdate,
    validateAdminLogin,
    validateAdminOtp,
    validateAdminOtpResend,
    validateEmailOnly,
    validateResetPassword,
    validateLead,
    validateLeadUpdate,
    validateLeadStageChange,
    validateLeadActivity,
    validateLeadFollowup,
    validateLeadFollowupUpdate,
    validateLeadConvert,
    validateGymProfileUpdate,
    validatePasswordUpdate,
};
