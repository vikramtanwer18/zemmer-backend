const prisma = require('../config/db');
const AppError = require('../utils/appError');

function startOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

const COUNTERS = {
    member: {
        planField: 'maxMembers',
        label: 'member',
        async count(gym_id) {
            return prisma.member.count({
                where: { gym_id, status: 'ACTIVE' },
            });
        },
    },
    staff: {
        planField: 'maxStaffUsers',
        label: 'staff member',
        async count(gym_id) {
            return prisma.staffMember.count({ where: { gym_id } });
        },
    },
    class: {
        planField: 'maxClassesPerMonth',
        label: 'class',
        async count(gym_id) {
            return prisma.class.count({
                where: { gym_id, starts_at: { gte: startOfMonth() } },
            });
        },
    },
};

/**
 * Factory middleware. Use AFTER requireActiveSubscription (which populates req.subscription).
 * Convention: plan field value -1 means unlimited (skip check).
 */
function enforcePlanLimit(resource) {
    return async (req, res, next) => {
        try {
            const counter = COUNTERS[resource];
            if (!counter) {
                return next(new AppError(
                    `Unknown plan-limit resource: ${resource}`,
                    500,
                    'PLAN_LIMIT_MISCONFIGURED'
                ));
            }

            const sub = req.subscription;
            if (!sub || !sub.saasPlan) {
                return next(new AppError(
                    'No active subscription found. Cannot enforce plan limit.',
                    402,
                    'SUBSCRIPTION_REQUIRED'
                ));
            }

            const max = sub.saasPlan[counter.planField];
            if (max === -1) return next(); // unlimited tier

            const current = await counter.count(req.user.gym_id);
            if (current >= max) {
                return next(new AppError(
                    `You've reached your plan's ${counter.label} limit (${max}). Upgrade to add more.`,
                    402,
                    'PLAN_LIMIT_REACHED',
                    {
                        resource,
                        limit: max,
                        current,
                        plan: sub.saasPlan.key,
                        upgradeUrl: '/billing/upgrade',
                    }
                ));
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { enforcePlanLimit };
