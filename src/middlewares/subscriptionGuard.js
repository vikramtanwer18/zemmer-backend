const prisma = require('../config/db');
const AppError = require('../utils/appError');
const {
    effectiveStatus,
    daysRemaining,
    nextBillingAt,
} = require('../utils/subscription');

const SAAS_PLAN_SELECT = {
    id: true,
    key: true,
    name: true,
    monthlyPricePaise: true,
    annualPricePaise: true,
    maxMembers: true,
    maxStaffUsers: true,
    maxClassesPerMonth: true,
    featureFlags: true,
    isActive: true,
};

async function loadSubscriptionFor(req) {
    const sub = await prisma.subscription.findUnique({
        where: { gym_id: req.user.gym_id },
        include: { saasPlan: { select: SAAS_PLAN_SELECT } },
    });
    return sub;
}

function attachWarningHeaders(res, eff, sub) {
    if (eff === 'PAST_DUE' || eff === 'CANCELLED') {
        res.setHeader('X-Subscription-Status', eff);
        const days = daysRemaining(sub);
        if (days != null) res.setHeader('X-Subscription-Days-Remaining', String(days));
    }
    if (eff === 'TRIALING') {
        const days = daysRemaining(sub);
        if (days != null && days <= 5) {
            res.setHeader('X-Trial-Days-Remaining', String(days));
        }
    }
}

/**
 * Blocks if effective status is EXPIRED or no subscription exists.
 * Allows TRIALING / ACTIVE / PAST_DUE (within grace) / CANCELLED (until periodEnd).
 *
 * Populates:
 *   req.subscription      = full subscription with saasPlan
 *   req.effectiveStatus   = computed status (TRIALING|ACTIVE|PAST_DUE|CANCELLED|EXPIRED)
 */
async function requireActiveSubscription(req, res, next) {
    try {
        if (!req.user || !req.user.gym_id) {
            return next(new AppError(
                'No gym context for the current user',
                400,
                'NO_GYM_CONTEXT'
            ));
        }

        const sub = await loadSubscriptionFor(req);
        if (!sub) {
            return next(new AppError(
                'No subscription on file for your gym. Please contact support.',
                402,
                'SUBSCRIPTION_REQUIRED'
            ));
        }

        const eff = effectiveStatus(sub);
        if (eff === 'EXPIRED') {
            return next(new AppError(
                'Your subscription has ended. Upgrade to continue.',
                402,
                'SUBSCRIPTION_INACTIVE',
                {
                    status: eff,
                    plan: sub.saasPlan ? sub.saasPlan.key : null,
                    nextBillingAt: nextBillingAt(sub),
                    upgradeUrl: '/billing/upgrade',
                }
            ));
        }

        attachWarningHeaders(res, eff, sub);
        req.subscription = sub;
        req.effectiveStatus = eff;
        next();
    } catch (error) {
        next(error);
    }
}

/**
 * Non-blocking: just attaches subscription if available.
 * Use on routes that should keep working when expired (billing/profile pages),
 * but want to know subscription state for response shaping.
 */
async function attachSubscription(req, res, next) {
    try {
        if (!req.user || !req.user.gym_id) {
            req.subscription = null;
            req.effectiveStatus = 'NONE';
            return next();
        }

        const sub = await loadSubscriptionFor(req);
        if (!sub) {
            req.subscription = null;
            req.effectiveStatus = 'NONE';
            return next();
        }

        const eff = effectiveStatus(sub);
        attachWarningHeaders(res, eff, sub);
        req.subscription = sub;
        req.effectiveStatus = eff;
        next();
    } catch (error) {
        next(error);
    }
}

/**
 * Feature flag gate (preview helper for Phase 6 — included now since it's tiny).
 * Use after requireActiveSubscription to check a boolean feature flag from the plan.
 *
 *   router.post('/leads',
 *     authenticate,
 *     requireActiveSubscription,
 *     requireFeature('lead_pipeline'),
 *     authorize('OWNER','TRAINER','COACH'),
 *     ...);
 */
function requireFeature(featureKey) {
    return (req, res, next) => {
        const flags = req.subscription && req.subscription.saasPlan && req.subscription.saasPlan.featureFlags;
        if (!flags || !flags[featureKey]) {
            return next(new AppError(
                `Feature '${featureKey}' is not available on your plan. Upgrade to enable it.`,
                402,
                'FEATURE_NOT_IN_PLAN',
                {
                    feature: featureKey,
                    currentPlan: req.subscription && req.subscription.saasPlan ? req.subscription.saasPlan.key : null,
                    upgradeUrl: '/billing/upgrade',
                }
            ));
        }
        next();
    };
}

module.exports = {
    requireActiveSubscription,
    attachSubscription,
    requireFeature,
};
