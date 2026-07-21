const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { getNowIST, getFutureDateIST } = require('../utils/timezone');

async function resolveGymId(req) {
    if (req.user && req.user.gym_id) return req.user.gym_id;
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { gym_id: true },
    });
    if (!user) {
        throw new AppError('Authenticated user not found', 404, 'USER_NOT_FOUND');
    }
    req.user.gym_id = user.gym_id;
    return user.gym_id;
}

function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

async function createMembership(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { member_id, plan_id, start_date, status } = req.body;

        const [member, plan] = await Promise.all([
            prisma.member.findFirst({ where: { id: member_id, gym_id }, select: { id: true } }),
            prisma.plan.findFirst({ where: { id: plan_id, gym_id }, select: { id: true, duration_days: true } }),
        ]);

        if (!member) {
            return next(new AppError('Member not found in your gym', 404, 'MEMBER_NOT_FOUND'));
        }
        if (!plan) {
            return next(new AppError('Plan not found in your gym', 404, 'PLAN_NOT_FOUND'));
        }

        const start = start_date ? new Date(start_date) : getNowIST();
        const end = addDays(start, plan.duration_days);

        const activeOverlap = await prisma.membership.findFirst({
            where: {
                member_id,
                status: { in: ['ACTIVE', 'FROZEN'] },
                end_date: { gt: start },
            },
            select: { id: true },
        });
        if (activeOverlap) {
            return next(new AppError(
                'This member already has an active or frozen membership overlapping the start date',
                409,
                'MEMBERSHIP_OVERLAP'
            ));
        }

        const membership = await prisma.membership.create({
            data: {
                gym_id,
                member: { connect: { id: member_id } },
                plan: { connect: { id: plan_id } },
                start_date: start,
                end_date: end,
                status: status || 'ACTIVE',
            },
        });

        return new ApiResponse(res, 201, { membership }, 'Membership created successfully.');
    } catch (error) {
        console.error('Error creating membership:', error);
        return next(error);
    }
}

async function getMemberships(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { status, member_id, plan_id, expiringInDays } = req.query;

        const where = { gym_id };
        if (status) where.status = status;
        if (member_id) where.member_id = member_id;
        if (plan_id) where.plan_id = plan_id;
        if (expiringInDays) {
            const days = parseInt(expiringInDays, 10);
            if (!isNaN(days) && days > 0) {
                const now = getNowIST();
                where.end_date = { gte: now, lte: addDays(now, days) };
            }
        }

        const [memberships, total] = await Promise.all([
            prisma.membership.findMany({
                where,
                skip,
                take: limit,
                orderBy: { end_date: 'asc' },
                include: {
                    member: { select: { id: true, name: true, user: { select: { phone: true } } } },
                },
            }),
            prisma.membership.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            memberships,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Memberships fetched successfully.');
    } catch (error) {
        console.error('Error fetching memberships:', error);
        return next(error);
    }
}

async function getMembershipById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const membership = await prisma.membership.findFirst({
            where: { id, gym_id },
            include: {
                member: { select: { id: true, name: true, user: { select: { phone: true, email: true } } } },
                freezes: { orderBy: { from_date: 'desc' } },
            },
        });

        if (!membership) {
            return next(new AppError('Membership not found', 404, 'MEMBERSHIP_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { membership }, 'Membership fetched successfully.');
    } catch (error) {
        console.error('Error fetching membership:', error);
        return next(error);
    }
}

async function updateMembership(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { start_date, end_date, status, plan_id } = req.body;

        const existing = await prisma.membership.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Membership not found', 404, 'MEMBERSHIP_NOT_FOUND'));
        }

        if (plan_id) {
            const plan = await prisma.plan.findFirst({
                where: { id: plan_id, gym_id },
                select: { id: true },
            });
            if (!plan) {
                return next(new AppError('Plan not found in your gym', 404, 'PLAN_NOT_FOUND'));
            }
        }

        const data = {};
        if (plan_id !== undefined) data.plan = { connect: { id: plan_id } };
        if (start_date !== undefined) data.start_date = new Date(start_date);
        if (end_date !== undefined) data.end_date = new Date(end_date);
        if (status !== undefined) data.status = status;

        if (data.start_date && data.end_date && data.end_date <= data.start_date) {
            return next(new AppError('end_date must be after start_date', 400, 'INVALID_DATE_RANGE'));
        }

        const membership = await prisma.membership.update({
            where: { id },
            data,
        });

        return new ApiResponse(res, 200, { membership }, 'Membership updated successfully.');
    } catch (error) {
        console.error('Error updating membership:', error);
        return next(error);
    }
}

async function deleteMembership(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.membership.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Membership not found', 404, 'MEMBERSHIP_NOT_FOUND'));
        }

        await prisma.membership.delete({ where: { id } });

        return new ApiResponse(res, 200, null, 'Membership deleted successfully.');
    } catch (error) {
        console.error('Error deleting membership:', error);
        return next(error);
    }
}

async function freezeMembership(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { from_date, duration_days, reason } = req.body;

        const membership = await prisma.membership.findFirst({
            where: { id, gym_id },
            include: { freezes: true },
        });
        if (!membership) {
            return next(new AppError('Membership not found', 404, 'MEMBERSHIP_NOT_FOUND'));
        }
        if (membership.status !== 'ACTIVE') {
            return next(new AppError(
                'Only ACTIVE memberships can be frozen',
                400,
                'INVALID_MEMBERSHIP_STATUS'
            ));
        }

        const plan = await prisma.plan.findFirst({
            where: { id: membership.plan_id, gym_id },
            select: { max_freeze_days: true },
        });
        const usedFreezeDays = membership.freezes.reduce((sum, f) => sum + f.duration_days, 0);
        if (plan && usedFreezeDays + duration_days > plan.max_freeze_days) {
            return next(new AppError(
                `Freeze would exceed plan's max freeze days (${plan.max_freeze_days}). Already used ${usedFreezeDays}.`,
                400,
                'FREEZE_LIMIT_EXCEEDED'
            ));
        }

        const freezeStart = from_date ? new Date(from_date) : getNowIST();
        const newEndDate = addDays(membership.end_date, duration_days);

        const [freeze, updatedMembership] = await prisma.$transaction([
            prisma.membershipFreeze.create({
                data: {
                    gym_id,
                    membership: { connect: { id } },
                    from_date: freezeStart,
                    duration_days,
                    reason: reason || null,
                },
            }),
            prisma.membership.update({
                where: { id },
                data: { status: 'FROZEN', end_date: newEndDate },
            }),
        ]);

        return new ApiResponse(res, 200, { freeze, membership: updatedMembership }, 'Membership frozen successfully.');
    } catch (error) {
        console.error('Error freezing membership:', error);
        return next(error);
    }
}

async function unfreezeMembership(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const membership = await prisma.membership.findFirst({
            where: { id, gym_id },
            select: { id: true, status: true },
        });
        if (!membership) {
            return next(new AppError('Membership not found', 404, 'MEMBERSHIP_NOT_FOUND'));
        }
        if (membership.status !== 'FROZEN') {
            return next(new AppError(
                'Only FROZEN memberships can be unfrozen',
                400,
                'INVALID_MEMBERSHIP_STATUS'
            ));
        }

        const updated = await prisma.membership.update({
            where: { id },
            data: { status: 'ACTIVE' },
        });

        return new ApiResponse(res, 200, { membership: updated }, 'Membership unfrozen successfully.');
    } catch (error) {
        console.error('Error unfreezing membership:', error);
        return next(error);
    }
}

module.exports = {
    createMembership,
    getMemberships,
    getMembershipById,
    updateMembership,
    deleteMembership,
    freezeMembership,
    unfreezeMembership,
};
