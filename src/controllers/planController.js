const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');

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

async function createPlan(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { name, price, duration_days, description, max_freeze_days } = req.body;

        const existing = await prisma.plan.findFirst({
            where: { gym_id, name: { equals: name, mode: 'insensitive' } },
            select: { id: true },
        });
        if (existing) {
            return next(new AppError(
                'A plan with this name already exists in your gym',
                409,
                'PLAN_EXISTS',
                { name: 'Plan name already in use' }
            ));
        }

        const plan = await prisma.plan.create({
            data: {
                gym: { connect: { id: gym_id } },
                name,
                price,
                duration_days,
                description: description || null,
                max_freeze_days: max_freeze_days ?? 0,
            },
        });

        return new ApiResponse(res, 201, { plan }, 'Plan created successfully.');
    } catch (error) {
        console.error('Error creating plan:', error);
        return next(error);
    }
}

async function getPlans(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { search } = req.query;

        const where = { gym_id };
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const [plans, total] = await Promise.all([
            prisma.plan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { price: 'asc' },
            }),
            prisma.plan.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            plans,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Plans fetched successfully.');
    } catch (error) {
        console.error('Error fetching plans:', error);
        return next(error);
    }
}

async function getPlanById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const plan = await prisma.plan.findFirst({
            where: { id, gym_id },
        });

        if (!plan) {
            return next(new AppError('Plan not found', 404, 'PLAN_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { plan }, 'Plan fetched successfully.');
    } catch (error) {
        console.error('Error fetching plan:', error);
        return next(error);
    }
}

async function updatePlan(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { name, price, duration_days, description, max_freeze_days } = req.body;

        const existing = await prisma.plan.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Plan not found', 404, 'PLAN_NOT_FOUND'));
        }

        if (name) {
            const nameClash = await prisma.plan.findFirst({
                where: {
                    gym_id,
                    name: { equals: name, mode: 'insensitive' },
                    NOT: { id },
                },
                select: { id: true },
            });
            if (nameClash) {
                return next(new AppError(
                    'Another plan already uses this name',
                    409,
                    'PLAN_NAME_IN_USE',
                    { name: 'Plan name already in use' }
                ));
            }
        }

        const data = {};
        if (name !== undefined) data.name = name;
        if (price !== undefined) data.price = price;
        if (duration_days !== undefined) data.duration_days = duration_days;
        if (description !== undefined) data.description = description || null;
        if (max_freeze_days !== undefined) data.max_freeze_days = max_freeze_days;

        const plan = await prisma.plan.update({
            where: { id },
            data,
        });

        return new ApiResponse(res, 200, { plan }, 'Plan updated successfully.');
    } catch (error) {
        console.error('Error updating plan:', error);
        return next(error);
    }
}

async function deletePlan(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.plan.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Plan not found', 404, 'PLAN_NOT_FOUND'));
        }

        await prisma.plan.delete({ where: { id } });

        return new ApiResponse(res, 200, null, 'Plan deleted successfully.');
    } catch (error) {
        console.error('Error deleting plan:', error);
        return next(error);
    }
}

module.exports = {
    createPlan,
    getPlans,
    getPlanById,
    updatePlan,
    deletePlan,
};
