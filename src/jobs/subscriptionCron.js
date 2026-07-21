const cron = require('node-cron');
const prisma = require('../config/db');
const {
    sendTrialReminderEmail,
    sendTrialExpiredEmail,
    sendEmail,
} = require('../utils/sendEmail');
const {
    PAST_DUE_GRACE_MS,
    MS_PER_DAY,
} = require('../utils/subscription');
const { getNowIST } = require('../utils/timezone');

const CRON_SCHEDULE = process.env.SUBSCRIPTION_CRON_SCHEDULE || '0 2 * * *'; // 02:00 daily, server-local TZ
const REMINDER_DAYS = [3, 1]; // send at "3 days left" and "1 day left"
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
const UPGRADE_URL = `${APP_BASE_URL}/billing/upgrade`;

/**
 * Find the OWNER user of a gym, used for sending notification emails.
 */
async function findGymOwner(gym_id) {
    return prisma.user.findFirst({
        where: { gym_id, role: 'OWNER' },
        select: { id: true, email: true, gym: { select: { name: true } } },
    });
}

/**
 * Transition expired subscriptions in the DB and send "trial expired" emails to owners
 * whose trial just ended.
 */
async function expireSubscriptions() {
    const now = getNowIST();
    const pastDueCutoff = new Date(now.getTime() - PAST_DUE_GRACE_MS);

    // 1. Trial expired
    const trialingExpired = await prisma.subscription.findMany({
        where: { status: 'TRIALING', trialEndsAt: { lt: now } },
        include: { saasPlan: { select: { name: true } } },
    });

    // 2. ACTIVE past period end (no payment received — Razorpay will fix once wired)
    const activeExpired = await prisma.subscription.findMany({
        where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
        include: { saasPlan: { select: { name: true } } },
    });

    // 3. CANCELLED past period end
    const cancelledExpired = await prisma.subscription.findMany({
        where: { status: 'CANCELLED', currentPeriodEnd: { lt: now } },
        include: { saasPlan: { select: { name: true } } },
    });

    // 4. PAST_DUE > grace
    const pastDueExpired = await prisma.subscription.findMany({
        where: { status: 'PAST_DUE', updated_at: { lt: pastDueCutoff } },
        include: { saasPlan: { select: { name: true } } },
    });

    const allExpired = [...trialingExpired, ...activeExpired, ...cancelledExpired, ...pastDueExpired];
    if (allExpired.length === 0) {
        return { expiredCount: 0, emailsSent: 0 };
    }

    const ids = allExpired.map((s) => s.id);
    await prisma.subscription.updateMany({
        where: { id: { in: ids } },
        data: { status: 'EXPIRED' },
    });

    // Send "trial expired" email only for trial transitions (not paid expiries)
    let emailsSent = 0;
    for (const sub of trialingExpired) {
        try {
            const owner = await findGymOwner(sub.gym_id);
            if (!owner) continue;
            await sendTrialExpiredEmail({
                to: owner.email,
                name: owner.email.split('@')[0],
                gymName: owner.gym ? owner.gym.name : 'your gym',
                planName: sub.saasPlan ? sub.saasPlan.name : 'Trial',
                upgradeUrl: UPGRADE_URL,
            });
            emailsSent += 1;
        } catch (err) {
            console.error(`[cron] trial-expired email failed for sub ${sub.id}:`, err.message);
        }
    }

    return { expiredCount: ids.length, emailsSent };
}

/**
 * Send "X days left" reminder emails for trials approaching expiry.
 * Uses lastReminderSentAt to dedupe across cron runs.
 */
async function sendTrialReminders() {
    const now = getNowIST();
    let sent = 0;

    for (const daysLeft of REMINDER_DAYS) {
        const windowStart = new Date(now.getTime() + (daysLeft - 0.5) * MS_PER_DAY);
        const windowEnd = new Date(now.getTime() + (daysLeft + 0.5) * MS_PER_DAY);

        const trialing = await prisma.subscription.findMany({
            where: {
                status: 'TRIALING',
                trialEndsAt: { gte: windowStart, lte: windowEnd },
                OR: [
                    { lastReminderSentAt: null },
                    { lastReminderSentAt: { lt: getNowIST() } },
                ],
            },
            include: { saasPlan: { select: { name: true } } },
        });

        for (const sub of trialing) {
            try {
                const owner = await findGymOwner(sub.gym_id);
                if (!owner) continue;
                await sendTrialReminderEmail({
                    to: owner.email,
                    name: owner.email.split('@')[0],
                    gymName: owner.gym ? owner.gym.name : 'your gym',
                    daysLeft,
                    planName: sub.saasPlan ? sub.saasPlan.name : 'trial',
                    upgradeUrl: UPGRADE_URL,
                });
                await prisma.subscription.update({
                    where: { id: sub.id },
                    data: { lastReminderSentAt: now },
                });
                sent += 1;
            } catch (err) {
                console.error(`[cron] trial-reminder email failed for sub ${sub.id}:`, err.message);
            }
        }
    }

    return { remindersSent: sent };
}

/**
 * Send payment recovery reminders for subscriptions in grace period
 * Grace period is 3 days from gracePeriodStartedAt
 */
async function sendGracePeriodReminders() {
    const now = getNowIST();
    const GRACE_DAYS = 3;
    const graceCutoff = new Date(now.getTime() - GRACE_DAYS * MS_PER_DAY);

    const pastDue = await prisma.subscription.findMany({
        where: {
            status: 'PAST_DUE',
            gracePeriodStartedAt: { gte: graceCutoff },
        },
        include: {
            gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
        },
    });

    let sent = 0;
    for (const sub of pastDue) {
        try {
            const graceEndsAt = new Date(sub.gracePeriodStartedAt.getTime() + GRACE_DAYS * MS_PER_DAY);
            const daysRemainingInGrace = Math.ceil((graceEndsAt.getTime() - now.getTime()) / MS_PER_DAY);

            if (daysRemainingInGrace > 0 && sub.gym?.user?.email) {
                const html = `<p>Hello ${sub.gym.gymName},</p>
                      <p>Your payment failed. You have ${daysRemainingInGrace} days to update your payment method.</p>
                      <p>Grace period expires: ${graceEndsAt.toLocaleDateString()}</p>
                      <p>Update your payment to avoid service interruption.</p>`;
                    await sendEmail({
                    to: sub.gym.user.email,
                    subject: `Payment Failed - ${daysRemainingInGrace} Days to Update Payment`,
                    html,
                    text: `Payment failed. ${daysRemainingInGrace} days remaining. Update payment by ${graceEndsAt.toLocaleDateString()}`,
                }).catch(err => console.error('Email send failed:', err));

                await prisma.subscription.update({
                    where: { id: sub.id },
                    data: { lastReminderSentAt: now },
                });
                sent += 1;
            }
        } catch (err) {
            console.error(`[cron] grace-period reminder email failed for sub ${sub.id}:`, err.message);
        }
    }

    return { graceRemindersSent: sent };
}

async function runDailySubscriptionSweep() {
    const startedAt = new Date();
    console.log(`[cron] subscription sweep started @ ${startedAt.toISOString()}`);
    try {
        const expiry = await expireSubscriptions();
        const reminders = await sendTrialReminders();
        const graceReminders = await sendGracePeriodReminders();
        const ms = Date.now() - startedAt.getTime();
        console.log(
            `[cron] subscription sweep complete in ${ms}ms — ` +
            `expired:${expiry.expiredCount} expired-emails:${expiry.emailsSent} trial-reminders:${reminders.remindersSent} grace-reminders:${graceReminders.graceRemindersSent}`
        );
        return { ...expiry, ...reminders, ...graceReminders, durationMs: ms };
    } catch (err) {
        console.error('[cron] subscription sweep failed:', err);
        throw err;
    }
}

function startSubscriptionCron() {
    if (process.env.SUBSCRIPTION_CRON_DISABLED === 'true') {
        console.log('[cron] subscription cron disabled via SUBSCRIPTION_CRON_DISABLED');
        return null;
    }
    if (!cron.validate(CRON_SCHEDULE)) {
        console.error(`[cron] invalid SUBSCRIPTION_CRON_SCHEDULE: ${CRON_SCHEDULE}`);
        return null;
    }
    const task = cron.schedule(CRON_SCHEDULE, () => {
        runDailySubscriptionSweep().catch((err) => console.error('[cron] sweep error:', err));
    });
    console.log(`[cron] subscription cron scheduled: "${CRON_SCHEDULE}"`);
    return task;
}

module.exports = {
    startSubscriptionCron,
    runDailySubscriptionSweep,
    expireSubscriptions,
    sendTrialReminders,
    sendGracePeriodReminders,
};
