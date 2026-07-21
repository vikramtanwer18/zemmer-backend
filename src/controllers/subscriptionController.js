const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const {
    effectiveStatus,
    daysRemaining,
    isLocked,
    showUpgradeBanner,
    nextBillingAt,
} = require('../utils/subscription');
const { getNowIST, getMonthlyPeriodEndIST, getAnnualPeriodEndIST } = require('../utils/timezone');
const {
    createCustomer,
    fetchCustomer,
    createSubscription,
    createOrder,
} = require('../services/razorpayService');
const { sendEmail } = require('../utils/sendEmail');

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

async function getMySubscription(req, res, next) {
    try {
        if (!req.user || !req.user.gym_id) {
            return next(new AppError(
                'No gym context for the current user',
                400,
                'NO_GYM_CONTEXT'
            ));
        }

        const sub = await prisma.subscription.findUnique({
            where: { gym_id: req.user.gym_id },
            include: { saasPlan: { select: SAAS_PLAN_SELECT } },
        });

        if (!sub) {
            return next(new AppError(
                'No subscription found for your gym',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        const effective = effectiveStatus(sub);
        const tier = sub.saasPlan ? sub.saasPlan.key : null; // TRIAL | PRO | ELITE
        const isTrialPlan = tier === 'TRIAL';

        return new ApiResponse(res, 200, {
            subscription: {
                id: sub.id,
                tier,
                status: sub.status,
                effectiveStatus: effective,
                trialStartedAt: isTrialPlan ? sub.trialStartedAt : null,
                trialEndsAt: isTrialPlan ? sub.trialEndsAt : null,
                currentPeriodStart: isTrialPlan ? null : sub.currentPeriodStart,
                currentPeriodEnd: isTrialPlan ? null : sub.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                cancelledAt: sub.cancelledAt,
                nextBillingAt: nextBillingAt(sub),
                daysRemaining: daysRemaining(sub),
                saasPlan: sub.saasPlan,
                isLocked: isLocked(sub),
                showUpgradeBanner: showUpgradeBanner(sub),
            },
        }, 'Subscription fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function initiateUpgrade(req, res, next) {
    try {
        if (!req.user || !req.user.gym_id) {
            return next(new AppError(
                'No gym context for the current user',
                400,
                'NO_GYM_CONTEXT'
            ));
        }

        const { planKey, billingCycle } = req.body;

        if (!planKey || !billingCycle) {
            return next(new AppError(
                'planKey and billingCycle are required',
                400,
                'INVALID_REQUEST',
                { planKey: 'Plan key required', billingCycle: 'Billing cycle required' }
            ));
        }

        if (!['PRO', 'ELITE'].includes(planKey)) {
            return next(new AppError(
                'Invalid plan. Available: PRO, ELITE',
                400,
                'INVALID_PLAN',
                { planKey: 'Invalid plan key' }
            ));
        }

        if (!['monthly', 'annual'].includes(billingCycle)) {
            return next(new AppError(
                'Invalid billing cycle. Available: monthly, annual',
                400,
                'INVALID_BILLING_CYCLE',
                { billingCycle: 'Invalid billing cycle' }
            ));
        }

        // Get current subscription and gym details
        const currentSub = await prisma.subscription.findUnique({
            where: { gym_id: req.user.gym_id },
            include: {
                saasPlan: { select: SAAS_PLAN_SELECT },
                gym: { select: { id: true, gymName: true, user: { select: { email: true, phone: true } } } },
            },
        });

        if (!currentSub) {
            return next(new AppError(
                'No subscription found',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        const currentEff = effectiveStatus(currentSub);
        if (currentEff === 'EXPIRED') {
            return next(new AppError(
                'Subscription expired. Cannot upgrade.',
                402,
                'SUBSCRIPTION_EXPIRED'
            ));
        }

        // Get new plan
        const newPlan = await prisma.saasPlan.findUnique({
            where: { key: planKey },
            select: SAAS_PLAN_SELECT,
        });

        if (!newPlan) {
            return next(new AppError(
                `Plan ${planKey} not found`,
                404,
                'PLAN_NOT_FOUND'
            ));
        }

        if (!newPlan.isActive) {
            return next(new AppError(
                `Plan ${planKey} is not active`,
                400,
                'PLAN_INACTIVE'
            ));
        }

        // Calculate period dates
        const periodStart = getNowIST();
        const periodEnd = billingCycle === 'monthly' ? getMonthlyPeriodEndIST() : getAnnualPeriodEndIST();
        const priceInPaise = billingCycle === 'monthly' ? newPlan.monthlyPricePaise : newPlan.annualPricePaise;

        // Create or fetch Razorpay customer
        let customerId = currentSub.razorpayCustomerId;
        if (!customerId) {
            const customer = await createCustomer({
                email: currentSub.gym.user.email,
                contact: currentSub.gym.user.phone,
                name: currentSub.gym.gymName,
                notes: { gym_id: currentSub.gym_id },
            });
            customerId = customer.id;
        }

        // Get plan's Razorpay ID based on billing cycle
        const razorpayPlanId = billingCycle === 'monthly'
            ? newPlan.rzpPlanIdMonthly
            : newPlan.rzpPlanIdAnnual;

        if (!razorpayPlanId) {
            return next(new AppError(
                `Razorpay plan ID not configured for ${planKey} ${billingCycle}`,
                500,
                'RAZORPAY_CONFIG_ERROR'
            ));
        }

        // Create Razorpay subscription
        const rzpSubscription = await createSubscription({
            planId: razorpayPlanId,
            customerId,
            quantity: 1,
            totalCount: null,
            notes: {
                gym_id: currentSub.gym_id,
                subscription_id: currentSub.id,
                plan_tier: planKey,
            },
        });

        // Create order for initial payment
        const order = await createOrder({
            amount: priceInPaise,
            currency: 'INR',
            customerId,
            receipt: `upgrade_${currentSub.id}`,
            description: `Gym Management - ${planKey} Plan (${billingCycle})`,
            notes: {
                gym_id: currentSub.gym_id,
                subscription_id: currentSub.id,
                razorpay_subscription_id: rzpSubscription.id,
            },
        });

        // Update subscription with Razorpay details
        const updated = await prisma.$transaction([
            prisma.subscription.update({
                where: { id: currentSub.id },
                data: {
                    saasPlan: { connect: { id: newPlan.id } },
                    status: 'ACTIVE',
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    razorpayCustomerId: customerId,
                    razorpaySubscriptionId: rzpSubscription.id,
                },
                include: { saasPlan: { select: SAAS_PLAN_SELECT } },
            }),
            prisma.billingInvoice.create({
                data: {
                    subscription_id: currentSub.id,
                    amount_paise: priceInPaise,
                    status: 'PENDING',
                    razorpayOrderId: order.id,
                },
            }),
            prisma.subscriptionAuditLog.create({
                data: {
                    subscription_id: currentSub.id,
                    action: 'UPGRADED',
                    changedBy: req.user.id,
                    details: {
                        from_plan: currentSub.saasPlan.key,
                        to_plan: planKey,
                        frequency: billingCycle,
                        razorpay_sub_id: rzpSubscription.id,
                    },
                },
            }),
        ]);

        // Send upgrade initiated email
        if (currentSub.gym.user.email) {
            const amountRupees = (priceInPaise / 100).toFixed(2);
            const html = `<p>Hello ${currentSub.gym.gymName},</p>
              <p>You've started upgrading to ${newPlan.name} (${billingCycle}).</p>
              <p>Amount: ₹${amountRupees}</p>
              <p>Complete your payment to activate your new plan.</p>`;
            await sendEmail({
                to: currentSub.gym.user.email,
                subject: 'Complete Your Upgrade - Gym Management',
                html,
                text: `Upgrade to ${newPlan.name}: ₹${amountRupees}. Complete payment to activate.`,
            }).catch(err => console.error('Email send failed:', err));
        }

        return new ApiResponse(res, 200, {
            subscription: {
                id: updated[0].id,
                status: updated[0].status,
                planKey: newPlan.key,
                planName: newPlan.name,
                billingCycle,
                priceInPaise,
                periodStart: periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
            },
            razorpayOrder: {
                orderId: order.id,
                amount: priceInPaise,
                currency: 'INR',
                key: process.env.RAZORPAY_API_KEY,
                subscription: {
                    id: rzpSubscription.id,
                    shortUrl: rzpSubscription.short_url,
                },
            },
        }, 'Upgrade initiated. Please complete payment.');
    } catch (error) {
        return next(error);
    }
}

async function handleUpgradePaymentSuccess(req, res, next) {
    try {
        const { subscriptionId, razorpayOrderId, razorpayPaymentId } = req.body;

        if (!subscriptionId || !razorpayOrderId || !razorpayPaymentId) {
            return next(new AppError(
                'Missing payment details',
                400,
                'INVALID_REQUEST'
            ));
        }

        const sub = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: { saasPlan: { select: SAAS_PLAN_SELECT } },
        });

        if (!sub) {
            return next(new AppError(
                'Subscription not found',
                404,
                'SUBSCRIPTION_NOT_FOUND'
            ));
        }

        if (sub.status !== 'PENDING_PAYMENT') {
            return next(new AppError(
                'Subscription is not in pending payment state',
                400,
                'INVALID_STATE'
            ));
        }

        // Mark subscription as ACTIVE (payment confirmed)
        const updated = await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'ACTIVE',
                razorpayOrderId,
                razorpayPaymentId,
            },
            include: { saasPlan: { select: SAAS_PLAN_SELECT } },
        });

        return new ApiResponse(res, 200, {
            subscription: {
                id: updated.id,
                status: updated.status,
                planKey: updated.saasPlan.key,
                planName: updated.saasPlan.name,
                currentPeriodStart: updated.currentPeriodStart,
                currentPeriodEnd: updated.currentPeriodEnd,
            },
        }, 'Upgrade successful! Your plan is now active.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getMySubscription,
    initiateUpgrade,
    handleUpgradePaymentSuccess,
};
