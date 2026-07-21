const prisma = require('../../config/db');
const ApiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');

async function createSaasPlan(req, res, next) {
    try {
        const {
            key,
            name,
            monthlyPricePaise,
            annualPricePaise,
            maxMembers,
            maxStaffUsers,
            maxClassesPerMonth,
            featureFlags,
            rzpPlanIdMonthly,
            rzpPlanIdAnnual,
            isActive,
        } = req.body;

        const existing = await prisma.saasPlan.findUnique({
            where: { key },
            select: { id: true },
        });
        if (existing) {
            return next(new AppError(
                'A SaaS plan with this key already exists',
                409,
                'SAAS_PLAN_EXISTS',
                { key: 'Key already in use' }
            ));
        }

        const plan = await prisma.saasPlan.create({
            data: {
                key,
                name,
                monthlyPricePaise,
                annualPricePaise,
                maxMembers,
                maxStaffUsers,
                maxClassesPerMonth,
                featureFlags: featureFlags || {},
                rzpPlanIdMonthly: rzpPlanIdMonthly,
                rzpPlanIdAnnual: rzpPlanIdAnnual,
                isActive: isActive !== undefined ? isActive : true,
            },
        });

        return new ApiResponse(res, 201, { plan }, 'SaaS plan created successfully.');
    } catch (error) {
        console.error('Error creating SaaS plan:', error);
        return next(error);
    }
}

async function getSaasPlans(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { isActive, search } = req.query;

        const where = {};
        if (isActive === 'true') where.isActive = true;
        if (isActive === 'false') where.isActive = false;
        if (search) {
            where.OR = [
                { key: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [plans, total] = await Promise.all([
            prisma.saasPlan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { monthlyPricePaise: 'asc' },
            }),
            prisma.saasPlan.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            plans,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'SaaS plans fetched successfully.');
    } catch (error) {
        console.error('Error fetching SaaS plans:', error);
        return next(error);
    }
}

async function getSaasPlanById(req, res, next) {
    try {
        const { id } = req.params;
        const plan = await prisma.saasPlan.findUnique({ where: { id } });

        if (!plan) {
            return next(new AppError('SaaS plan not found', 404, 'SAAS_PLAN_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { plan }, 'SaaS plan fetched successfully.');
    } catch (error) {
        console.error('Error fetching SaaS plan:', error);
        return next(error);
    }
}

async function updateSaasPlan(req, res, next) {
    try {
        const { id } = req.params;
        const {
            key,
            name,
            monthlyPricePaise,
            annualPricePaise,
            maxMembers,
            maxStaffUsers,
            maxClassesPerMonth,
            featureFlags,
            rzpPlanIdMonthly,
            rzpPlanIdAnnual,
            isActive,
        } = req.body;

        const existing = await prisma.saasPlan.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('SaaS plan not found', 404, 'SAAS_PLAN_NOT_FOUND'));
        }

        if (key) {
            const keyClash = await prisma.saasPlan.findFirst({
                where: { key, NOT: { id } },
                select: { id: true },
            });
            if (keyClash) {
                return next(new AppError(
                    'Another SaaS plan already uses this key',
                    409,
                    'SAAS_KEY_IN_USE',
                    { key: 'Key already in use' }
                ));
            }
        }

        const data = {};
        if (key !== undefined) data.key = key;
        if (name !== undefined) data.name = name;
        if (monthlyPricePaise !== undefined) data.monthlyPricePaise = monthlyPricePaise;
        if (annualPricePaise !== undefined) data.annualPricePaise = annualPricePaise;
        if (maxMembers !== undefined) data.maxMembers = maxMembers;
        if (maxStaffUsers !== undefined) data.maxStaffUsers = maxStaffUsers;
        if (maxClassesPerMonth !== undefined) data.maxClassesPerMonth = maxClassesPerMonth;
        if (featureFlags !== undefined) data.featureFlags = featureFlags;
        if (rzpPlanIdMonthly !== undefined) data.rzpPlanIdMonthly = rzpPlanIdMonthly;
        if (rzpPlanIdAnnual !== undefined) data.rzpPlanIdAnnual = rzpPlanIdAnnual;
        if (isActive !== undefined) data.isActive = isActive;

        const plan = await prisma.saasPlan.update({
            where: { id },
            data,
        });

        return new ApiResponse(res, 200, { plan }, 'SaaS plan updated successfully.');
    } catch (error) {
        console.error('Error updating SaaS plan:', error);
        return next(error);
    }
}

async function deleteSaasPlan(req, res, next) {
    try {
        const { id } = req.params;

        const existing = await prisma.saasPlan.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('SaaS plan not found', 404, 'SAAS_PLAN_NOT_FOUND'));
        }

        const gymsUsing = await prisma.gym.count({ where: { saasPlanId: id } });
        if (gymsUsing > 0) {
            return next(new AppError(
                `Cannot delete: ${gymsUsing} gym(s) are subscribed to this plan. Deactivate it instead.`,
                409,
                'SAAS_PLAN_IN_USE',
                { gymsUsing }
            ));
        }

        await prisma.saasPlan.delete({ where: { id } });

        return new ApiResponse(res, 200, null, 'SaaS plan deleted successfully.');
    } catch (error) {
        console.error('Error deleting SaaS plan:', error);
        return next(error);
    }
}

module.exports = {
    createSaasPlan,
    getSaasPlans,
    getSaasPlanById,
    updateSaasPlan,
    deleteSaasPlan,
};
