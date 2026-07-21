const prisma = require('../../config/db');
const ApiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { getNowIST } = require('../../utils/timezone');
const { cancelSubscription } = require('../../services/razorpayService');
const { sendEmail } = require('../../utils/sendEmail');

const SAAS_PLAN_SELECT = {
    id: true,
    key: true,
    name: true,
    monthlyPricePaise: true,
    annualPricePaise: true,
    maxMembers: true,
    maxStaffUsers: true,
    maxClassesPerMonth: true,
    isActive: true,
};

async function getAllSubscriptions(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { status, planKey, search, startDate, endDate } = req.query;

        const where = {};
        if (status) where.status = status;
        if (planKey) where.saasPlan = { key: planKey };
        if (search) {
            where.gym = {
                OR: [
                    { gymName: { contains: search, mode: 'insensitive' } },
                    { user: { email: { contains: search, mode: 'insensitive' } } },
                ],
            };
        }
        if (startDate || endDate) {
            where.created_at = {};
            if (startDate) where.created_at.gte = new Date(startDate);
            if (endDate) where.created_at.lte = new Date(endDate);
        }

        const [subscriptions, total] = await Promise.all([
            prisma.subscription.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
                    saasPlan: { select: SAAS_PLAN_SELECT },
                    invoices: { select: { id: true, status: true, amount_paise: true, created_at: true } },
                },
            }),
            prisma.subscription.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            subscriptions,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Subscriptions fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function getSubscriptionDetails(req, res, next) {
    try {
        const { subscriptionId } = req.params;

        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: {
                gym: { select: { id: true, gymName: true, user: { select: { email: true, phone: true } } } },
                saasPlan: { select: SAAS_PLAN_SELECT },
                invoices: {
                    orderBy: { created_at: 'desc' },
                    include: { subscription: { select: { id: true } } },
                },
                auditLogs: {
                    orderBy: { created_at: 'desc' },
                    take: 50,
                },
            },
        });

        if (!sub) {
            return next(new AppError(
                'Subscription not found',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        return new ApiResponse(res, 200, { subscription: sub }, 'Subscription details fetched.');
    } catch (error) {
        return next(error);
    }
}

async function cancelSubscriptionAdmin(req, res, next) {
    try {
        const { subscriptionId } = req.params;
        const { reason, immediate } = req.body;

        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: { gym: { select: { id: true, gymName: true, user: { select: { email: true } } } } },
        });

        if (!sub) {
            return next(new AppError(
                'Subscription not found',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        if (sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
            return next(new AppError(
                'Subscription is already cancelled or expired',
                400,
                'INVALID_STATE'
            ));
        }

        let updateData = {
            status: immediate ? 'EXPIRED' : 'CANCELLED',
            cancelledAt: getNowIST(),
        };

        if (immediate && sub.razorpaySubscriptionId) {
            await cancelSubscription(sub.razorpaySubscriptionId).catch(err =>
                console.error('Razorpay cancellation failed:', err)
            );
        }

        const updated = await prisma.$transaction([
            prisma.subscription.update({
                where: { id: subscriptionId },
                data: updateData,
                include: { saasPlan: { select: SAAS_PLAN_SELECT } },
            }),
            prisma.subscriptionAuditLog.create({
                data: {
                    subscription_id: subscriptionId,
                    action: immediate ? 'CANCELLED_IMMEDIATE' : 'CANCELLED',
                    changedBy: req.user.id,
                    reason: reason || 'Admin action',
                    details: { immediate },
                },
            }),
        ]);

        if (sub.gym?.user?.email) {
            const html = `<p>Hello ${sub.gym.gymName},</p>
              <p>Your subscription has been cancelled by our admin team.</p>
              <p>Reason: ${reason || 'No reason provided'}</p>
              <p>Contact support for more information.</p>`;
            await sendEmail({
                to: sub.gym.user.email,
                subject: 'Subscription Cancelled - Admin Action',
                html,
                text: `Your subscription has been cancelled. Reason: ${reason || 'Admin action'}`,
            }).catch(err => console.error('Email send failed:', err));
        }

        return new ApiResponse(res, 200, {
            subscription: updated[0],
        }, `Subscription ${immediate ? 'immediately' : 'softly'} cancelled.`);
    } catch (error) {
        return next(error);
    }
}

async function getAuditLog(req, res, next) {
    try {
        const { subscriptionId } = req.params;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: { id: true },
        });

        if (!sub) {
            return next(new AppError(
                'Subscription not found',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        const [logs, total] = await Promise.all([
            prisma.subscriptionAuditLog.findMany({
                where: { subscription_id: subscriptionId },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma.subscriptionAuditLog.count({ where: { subscription_id: subscriptionId } }),
        ]);

        return new ApiResponse(res, 200, {
            auditLogs: logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Audit logs fetched.');
    } catch (error) {
        return next(error);
    }
}

async function getAnalytics(req, res, next) {
    try {
        const { startDate, endDate } = req.query;

        const where = {};
        if (startDate || endDate) {
            where.created_at = {};
            if (startDate) where.created_at.gte = new Date(startDate);
            if (endDate) where.created_at.lte = new Date(endDate);
        }

        const [totalActive, totalExpired, byPlan, byStatus] = await Promise.all([
            prisma.subscription.count({
                where: { ...where, status: { in: ['ACTIVE', 'TRIALING'] } },
            }),
            prisma.subscription.count({
                where: { ...where, status: 'EXPIRED' },
            }),
            prisma.subscription.groupBy({
                by: ['saas_plan_id'],
                where,
                _count: { id: true },
            }),
            prisma.subscription.groupBy({
                by: ['status'],
                where,
                _count: { id: true },
            }),
        ]);

        const revenue = await prisma.billingInvoice.aggregate({
            where: { status: 'PAID', created_at: where.created_at },
            _sum: { amount_paise: true },
        });

        return new ApiResponse(res, 200, {
            analytics: {
                totalActive,
                totalExpired,
                byPlan,
                byStatus,
                totalRevenuePaise: revenue._sum.amount_paise || 0,
                totalRevenueRupees: (revenue._sum.amount_paise || 0) / 100,
            },
        }, 'Analytics fetched.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getAllSubscriptions,
    getSubscriptionDetails,
    cancelSubscriptionAdmin,
    getAuditLog,
    getAnalytics,
};
