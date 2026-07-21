const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');

async function resolveGymId(req) {
    if (req.user && req.user.gym_id) return req.user.gym_id;
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { gym_id: true },
    });
    if (!user) throw new AppError('Authenticated user not found', 404, 'USER_NOT_FOUND');
    req.user.gym_id = user.gym_id;
    return user.gym_id;
}

function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function sumPaise(rows) {
    return rows.reduce((total, row) => total + (row.amount_paise || 0), 0);
}

async function getOverview(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const now = new Date();
        const today = startOfDay(now);
        const weekAgo = addDays(today, -7);
        const thisMonthStart = startOfMonth(now);
        const lastMonthStart = addMonths(thisMonthStart, -1);
        const in7 = addDays(today, 7);
        const in30 = addDays(today, 30);

        const [
            totalMembers,
            activeMembers,
            newMembersThisMonth,
            activeMemberships,
            expiringIn7,
            expiringIn30,
            frozenMemberships,
            paidThisMonth,
            paidLastMonth,
            pendingInvoices,
            todayAttendance,
            weekAttendance,
            leadsByStage,
            pendingFollowups,
            upcomingClassesToday,
        ] = await Promise.all([
            prisma.member.count({ where: { gym_id } }),
            prisma.member.count({ where: { gym_id, status: 'ACTIVE' } }),
            prisma.member.count({ where: { gym_id, joined_on: { gte: thisMonthStart } } }),
            prisma.membership.count({ where: { gym_id, status: 'ACTIVE' } }),
            prisma.membership.count({
                where: { gym_id, status: 'ACTIVE', end_date: { gte: today, lte: in7 } },
            }),
            prisma.membership.count({
                where: { gym_id, status: 'ACTIVE', end_date: { gte: today, lte: in30 } },
            }),
            prisma.membership.count({ where: { gym_id, status: 'FROZEN' } }),
            prisma.invoice.findMany({
                where: { gym_id, status: 'PAID', paid_at: { gte: thisMonthStart } },
                select: { amount_paise: true },
            }),
            prisma.invoice.findMany({
                where: {
                    gym_id,
                    status: 'PAID',
                    paid_at: { gte: lastMonthStart, lt: thisMonthStart },
                },
                select: { amount_paise: true },
            }),
            prisma.invoice.findMany({
                where: { gym_id, status: 'PENDING' },
                select: { amount_paise: true },
            }),
            prisma.attendance.count({ where: { gym_id, checked_in: { gte: today } } }),
            prisma.attendance.count({ where: { gym_id, checked_in: { gte: weekAgo } } }),
            prisma.lead.groupBy({
                by: ['stage'],
                where: { gym_id },
                _count: { _all: true },
            }),
            prisma.leadFollowup.count({
                where: { gym_id, is_done: false, followup_at: { lte: in7 } },
            }),
            prisma.class.count({
                where: { gym_id, starts_at: { gte: now, lte: addDays(today, 1) } },
            }),
        ]);

        const pipeline = leadsByStage.reduce((acc, row) => {
            acc[row.stage] = row._count._all;
            return acc;
        }, {});
        const totalLeads = Object.values(pipeline).reduce((s, n) => s + n, 0);
        const wonLeads = pipeline.WON || 0;
        const conversionRate = totalLeads ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;

        return new ApiResponse(res, 200, {
            members: {
                total: totalMembers,
                active: activeMembers,
                newThisMonth: newMembersThisMonth,
            },
            memberships: {
                active: activeMemberships,
                frozen: frozenMemberships,
                expiringIn7Days: expiringIn7,
                expiringIn30Days: expiringIn30,
            },
            revenuePaise: {
                thisMonth: sumPaise(paidThisMonth),
                lastMonth: sumPaise(paidLastMonth),
                outstanding: sumPaise(pendingInvoices),
                pendingInvoiceCount: pendingInvoices.length,
            },
            attendance: {
                today: todayAttendance,
                last7Days: weekAttendance,
                dailyAverageLast7Days: Number((weekAttendance / 7).toFixed(1)),
            },
            leads: {
                total: totalLeads,
                pipeline,
                conversionRate,
                followupsDueIn7Days: pendingFollowups,
            },
            classes: {
                remainingToday: upcomingClassesToday,
            },
            generatedAt: now.toISOString(),
        }, 'Overview KPIs fetched.');
    } catch (error) {
        console.error('Error fetching overview:', error);
        return next(error);
    }
}

async function getMemberAnalytics(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);

        const today = startOfDay();
        const trendStart = startOfMonth(addMonths(today, -(months - 1)));

        const [byStatus, newMembers, active, churnedThisMonth] = await Promise.all([
            prisma.member.groupBy({
                by: ['status'],
                where: { gym_id },
                _count: { _all: true },
            }),
            prisma.member.findMany({
                where: { gym_id, joined_on: { gte: trendStart } },
                select: { joined_on: true },
            }),
            prisma.member.count({ where: { gym_id, status: 'ACTIVE' } }),
            prisma.member.count({
                where: { gym_id, status: 'CHURNED', joined_on: { gte: startOfMonth() } },
            }),
        ]);

        const byStatusMap = byStatus.reduce((acc, r) => {
            acc[r.status] = r._count._all;
            return acc;
        }, {});

        const buckets = [];
        for (let i = 0; i < months; i += 1) {
            const start = startOfMonth(addMonths(today, -(months - 1 - i)));
            const end = startOfMonth(addMonths(start, 1));
            const count = newMembers.filter((m) => m.joined_on >= start && m.joined_on < end).length;
            buckets.push({
                month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
                newMembers: count,
            });
        }

        return new ApiResponse(res, 200, {
            byStatus: byStatusMap,
            activeCount: active,
            churnedThisMonth,
            monthlyTrend: buckets,
        }, 'Member analytics fetched.');
    } catch (error) {
        console.error('Error fetching member analytics:', error);
        return next(error);
    }
}

async function getRevenueAnalytics(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 24);
        const today = startOfDay();
        const trendStart = startOfMonth(addMonths(today, -(months - 1)));

        const [paidInvoices, pendingInvoices, failedInvoices, refundedInvoices] = await Promise.all([
            prisma.invoice.findMany({
                where: {
                    gym_id,
                    status: 'PAID',
                    paid_at: { gte: trendStart },
                },
                select: { amount_paise: true, paid_at: true },
            }),
            prisma.invoice.findMany({
                where: { gym_id, status: 'PENDING' },
                select: { amount_paise: true, due_date: true },
            }),
            prisma.invoice.count({ where: { gym_id, status: 'FAILED' } }),
            prisma.invoice.count({ where: { gym_id, status: 'REFUNDED' } }),
        ]);

        const buckets = [];
        for (let i = 0; i < months; i += 1) {
            const start = startOfMonth(addMonths(today, -(months - 1 - i)));
            const end = startOfMonth(addMonths(start, 1));
            const paise = paidInvoices
                .filter((inv) => inv.paid_at && inv.paid_at >= start && inv.paid_at < end)
                .reduce((s, inv) => s + inv.amount_paise, 0);
            buckets.push({
                month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
                revenuePaise: paise,
            });
        }

        const now = new Date();
        const overdueAmount = pendingInvoices
            .filter((inv) => inv.due_date < now)
            .reduce((s, inv) => s + inv.amount_paise, 0);

        return new ApiResponse(res, 200, {
            monthlyTrend: buckets,
            outstanding: {
                totalPaise: sumPaise(pendingInvoices),
                invoiceCount: pendingInvoices.length,
                overduePaise: overdueAmount,
            },
            counts: {
                paidLastNMonths: paidInvoices.length,
                failed: failedInvoices,
                refunded: refundedInvoices,
            },
        }, 'Revenue analytics fetched.');
    } catch (error) {
        console.error('Error fetching revenue analytics:', error);
        return next(error);
    }
}

async function getAttendanceAnalytics(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
        const inactiveDays = Math.min(Math.max(parseInt(req.query.inactiveDays, 10) || 14, 1), 365);

        const today = startOfDay();
        const rangeStart = addDays(today, -(days - 1));
        const inactiveSince = addDays(today, -inactiveDays);

        const [recentAttendance, topMembers, activeMembers, activeMemberCheckins] = await Promise.all([
            prisma.attendance.findMany({
                where: { gym_id, checked_in: { gte: rangeStart } },
                select: { checked_in: true, member_id: true },
            }),
            prisma.attendance.groupBy({
                by: ['member_id'],
                where: { gym_id, checked_in: { gte: rangeStart } },
                _count: { _all: true },
                orderBy: { _count: { member_id: 'desc' } },
                take: 10,
            }),
            prisma.member.findMany({
                where: { gym_id, status: 'ACTIVE' },
                select: { id: true },
            }),
            prisma.attendance.findMany({
                where: { gym_id, checked_in: { gte: inactiveSince } },
                distinct: ['member_id'],
                select: { member_id: true },
            }),
        ]);

        const dailyBuckets = [];
        for (let i = 0; i < days; i += 1) {
            const start = addDays(today, -(days - 1 - i));
            const end = addDays(start, 1);
            const count = recentAttendance.filter((a) => a.checked_in >= start && a.checked_in < end).length;
            dailyBuckets.push({
                date: start.toISOString().slice(0, 10),
                checkins: count,
            });
        }

        const hourCounts = Array(24).fill(0);
        for (const row of recentAttendance) hourCounts[row.checked_in.getHours()] += 1;
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

        const topMemberIds = topMembers.map((r) => r.member_id);
        const topMemberProfiles = topMemberIds.length
            ? await prisma.member.findMany({
                where: { id: { in: topMemberIds }, gym_id },
                select: { id: true, name: true, user: { select: { phone: true } } },
            })
            : [];
        const profileMap = new Map(topMemberProfiles.map((m) => [m.id, m]));
        const topAttendees = topMembers.map((r) => ({
            member: profileMap.get(r.member_id) || { id: r.member_id },
            checkins: r._count._all,
        }));

        const checkedInMemberIds = new Set(activeMemberCheckins.map((a) => a.member_id));
        const inactiveMemberCount = activeMembers.filter((m) => !checkedInMemberIds.has(m.id)).length;

        return new ApiResponse(res, 200, {
            dailyTrend: dailyBuckets,
            hourDistribution: hourCounts.map((count, hour) => ({ hour, checkins: count })),
            peakHour,
            topAttendees,
            inactiveMembers: {
                count: inactiveMemberCount,
                totalActiveMembers: activeMembers.length,
                inactiveSinceDays: inactiveDays,
            },
        }, 'Attendance analytics fetched.');
    } catch (error) {
        console.error('Error fetching attendance analytics:', error);
        return next(error);
    }
}

async function getLeadAnalytics(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);

        const today = startOfDay();
        const trendStart = startOfMonth(addMonths(today, -(months - 1)));

        const [byStage, bySource, newLeads, overdueFollowups, upcomingFollowups] = await Promise.all([
            prisma.lead.groupBy({
                by: ['stage'],
                where: { gym_id },
                _count: { _all: true },
            }),
            prisma.lead.groupBy({
                by: ['source'],
                where: { gym_id },
                _count: { _all: true },
            }),
            prisma.lead.findMany({
                where: { gym_id, created_at: { gte: trendStart } },
                select: { created_at: true, stage: true },
            }),
            prisma.leadFollowup.count({
                where: { gym_id, is_done: false, followup_at: { lt: today } },
            }),
            prisma.leadFollowup.count({
                where: { gym_id, is_done: false, followup_at: { gte: today, lte: addDays(today, 7) } },
            }),
        ]);

        const pipeline = byStage.reduce((acc, r) => { acc[r.stage] = r._count._all; return acc; }, {});
        const sourceBreakdown = bySource.reduce((acc, r) => { acc[r.source] = r._count._all; return acc; }, {});
        const total = Object.values(pipeline).reduce((s, n) => s + n, 0);
        const won = pipeline.WON || 0;
        const lost = pipeline.LOST || 0;
        const conversionRate = total ? Number(((won / total) * 100).toFixed(2)) : 0;

        const buckets = [];
        for (let i = 0; i < months; i += 1) {
            const start = startOfMonth(addMonths(today, -(months - 1 - i)));
            const end = startOfMonth(addMonths(start, 1));
            const inBucket = newLeads.filter((l) => l.created_at >= start && l.created_at < end);
            const bucketWon = inBucket.filter((l) => l.stage === 'WON').length;
            buckets.push({
                month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
                newLeads: inBucket.length,
                wonLeads: bucketWon,
            });
        }

        return new ApiResponse(res, 200, {
            pipeline,
            sourceBreakdown,
            totals: { total, won, lost, conversionRate },
            monthlyTrend: buckets,
            followups: {
                overdue: overdueFollowups,
                upcomingIn7Days: upcomingFollowups,
            },
        }, 'Lead analytics fetched.');
    } catch (error) {
        console.error('Error fetching lead analytics:', error);
        return next(error);
    }
}

async function getClassAnalytics(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);

        const now = new Date();
        const today = startOfDay(now);
        const rangeStart = addDays(today, -(days - 1));
        const weekAhead = addDays(today, 7);

        const [upcomingToday, upcomingThisWeek, pastClasses, topClasses] = await Promise.all([
            prisma.class.count({
                where: { gym_id, starts_at: { gte: now, lt: addDays(today, 1) } },
            }),
            prisma.class.count({
                where: { gym_id, starts_at: { gte: now, lte: weekAhead } },
            }),
            prisma.class.findMany({
                where: { gym_id, starts_at: { gte: rangeStart, lt: now } },
                select: {
                    id: true,
                    name: true,
                    capacity: true,
                    bookings: { where: { status: 'CONFIRMED' }, select: { id: true } },
                },
            }),
            prisma.booking.groupBy({
                by: ['class_id'],
                where: { gym_id, status: 'CONFIRMED', created_at: { gte: rangeStart } },
                _count: { _all: true },
                orderBy: { _count: { class_id: 'desc' } },
                take: 5,
            }),
        ]);

        let capacitySum = 0;
        let bookedSum = 0;
        for (const cls of pastClasses) {
            capacitySum += cls.capacity;
            bookedSum += cls.bookings.length;
        }
        const fillRate = capacitySum > 0
            ? Number(((bookedSum / capacitySum) * 100).toFixed(2))
            : 0;

        const topClassIds = topClasses.map((r) => r.class_id);
        const topClassProfiles = topClassIds.length
            ? await prisma.class.findMany({
                where: { id: { in: topClassIds }, gym_id },
                select: { id: true, name: true, starts_at: true },
            })
            : [];
        const classMap = new Map(topClassProfiles.map((c) => [c.id, c]));
        const popularClasses = topClasses.map((r) => ({
            class: classMap.get(r.class_id) || { id: r.class_id },
            confirmedBookings: r._count._all,
        }));

        return new ApiResponse(res, 200, {
            upcoming: {
                today: upcomingToday,
                nextSevenDays: upcomingThisWeek,
            },
            pastWindow: {
                days,
                classesHeld: pastClasses.length,
                totalCapacity: capacitySum,
                totalBooked: bookedSum,
                averageFillRate: fillRate,
            },
            popularClasses,
        }, 'Class analytics fetched.');
    } catch (error) {
        console.error('Error fetching class analytics:', error);
        return next(error);
    }
}

module.exports = {
    getOverview,
    getMemberAnalytics,
    getRevenueAnalytics,
    getAttendanceAnalytics,
    getLeadAnalytics,
    getClassAnalytics,
};
