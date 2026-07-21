const { getNowIST } = require('./timezone');

const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function effectiveStatus(sub) {
    if (!sub) return 'NONE';
    const now = getNowIST();

    if (sub.status === 'TRIALING') {
        return sub.trialEndsAt && sub.trialEndsAt < now ? 'EXPIRED' : 'TRIALING';
    }
    if (sub.status === 'ACTIVE') {
        return sub.currentPeriodEnd && sub.currentPeriodEnd < now ? 'EXPIRED' : 'ACTIVE';
    }
    if (sub.status === 'CANCELLED') {
        return sub.currentPeriodEnd && sub.currentPeriodEnd < now ? 'EXPIRED' : 'CANCELLED';
    }
    if (sub.status === 'PAST_DUE') {
        return sub.updated_at && (now - sub.updated_at) > PAST_DUE_GRACE_MS ? 'EXPIRED' : 'PAST_DUE';
    }
    return sub.status;
}

function daysRemaining(sub) {
    if (!sub) return null;
    const eff = effectiveStatus(sub);
    let endDate = null;

    if (eff === 'TRIALING' && sub.trialEndsAt) endDate = sub.trialEndsAt;
    else if (eff === 'ACTIVE' && sub.currentPeriodEnd) endDate = sub.currentPeriodEnd;
    else if (eff === 'CANCELLED' && sub.currentPeriodEnd) endDate = sub.currentPeriodEnd;

    if (!endDate) return null;
    return Math.max(0, Math.ceil((endDate - getNowIST()) / MS_PER_DAY));
}

function isLocked(sub) {
    const eff = effectiveStatus(sub);
    return eff === 'EXPIRED' || eff === 'NONE';
}

function showUpgradeBanner(sub) {
    if (!sub) return false;
    const eff = effectiveStatus(sub);
    return ['TRIALING', 'PAST_DUE', 'CANCELLED', 'EXPIRED'].includes(eff);
}

function nextBillingAt(sub) {
    if (!sub) return null;
    const eff = effectiveStatus(sub);
    if (eff === 'TRIALING') return sub.trialEndsAt || null;
    if (eff === 'ACTIVE' || eff === 'CANCELLED') return sub.currentPeriodEnd || null;
    return null;
}

module.exports = {
    effectiveStatus,
    daysRemaining,
    isLocked,
    showUpgradeBanner,
    nextBillingAt,
    PAST_DUE_GRACE_MS,
    MS_PER_DAY,
};
