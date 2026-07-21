const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');

const QR_SECRET = process.env.ATTENDANCE_QR_SECRET || process.env.JWT_ACCESS_SECRET;
const QR_EXPIRATION = process.env.ATTENDANCE_QR_EXPIRATION || '60s';

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

async function resolveMemberIdForUser(req) {
    const member = await prisma.member.findUnique({
        where: { user_id: req.user.id },
        select: { id: true, gym_id: true },
    });
    if (!member) {
        throw new AppError(
            'No member profile is linked to your account',
            404,
            'MEMBER_PROFILE_NOT_FOUND'
        );
    }
    return member;
}

async function generateQrToken(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { member_id } = req.params;

        const member = await prisma.member.findFirst({
            where: { id: member_id, gym_id },
            select: { id: true, name: true, status: true },
        });
        if (!member) {
            return next(new AppError('Member not found in your gym', 404, 'MEMBER_NOT_FOUND'));
        }
        if (member.status !== 'ACTIVE') {
            return next(new AppError(
                `Cannot issue QR: member status is ${member.status}`,
                400,
                'MEMBER_NOT_ACTIVE'
            ));
        }

        const nonce = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign(
            { member_id: member.id, gym_id, nonce, typ: 'attendance' },
            QR_SECRET,
            { expiresIn: QR_EXPIRATION }
        );

        return new ApiResponse(res, 200, {
            token,
            expiresIn: QR_EXPIRATION,
            member: { id: member.id, name: member.name },
        }, 'QR token generated successfully.');
    } catch (error) {
        console.error('Error generating QR token:', error);
        return next(error);
    }
}

async function checkInWithQr(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { qrToken } = req.body;

        let payload;
        try {
            payload = jwt.verify(qrToken, QR_SECRET);
        } catch (err) {
            const code = err.name === 'TokenExpiredError' ? 'QR_EXPIRED' : 'QR_INVALID';
            const msg = err.name === 'TokenExpiredError' ? 'QR code has expired' : 'QR code is invalid';
            return next(new AppError(msg, 400, code));
        }

        if (payload.typ !== 'attendance') {
            return next(new AppError('Invalid QR token type', 400, 'QR_INVALID_TYPE'));
        }
        if (!payload.member_id || !payload.nonce) {
            return next(new AppError('QR token payload is missing required fields', 400, 'QR_INVALID_PAYLOAD'));
        }
        if (payload.gym_id !== gym_id) {
            return next(new AppError('QR code does not belong to your gym', 403, 'QR_WRONG_GYM'));
        }
        
        return await recordCheckIn(req, res, next, {
            gym_id,
            member_id: payload.member_id,
            method: 'QR',
            nonce: payload.nonce,
        });
    } catch (error) {
        console.error('Error in QR check-in:', error);
        return next(error);
    }
}

async function checkInManual(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { member_id, method } = req.body;

        return await recordCheckIn(req, res, next, {
            gym_id,
            member_id,
            method: method || 'MANUAL',
            nonce: crypto.randomBytes(16).toString('hex'),
        });
    } catch (error) {
        console.error('Error in manual check-in:', error);
        return next(error);
    }
}

async function recordCheckIn(req, res, next, { gym_id, member_id, method, nonce }) {
    const member = await prisma.member.findFirst({
        where: { id: member_id, gym_id },
        select: { id: true, name: true, status: true },
    });
    if (!member) {
        return next(new AppError('Member not found in your gym', 404, 'MEMBER_NOT_FOUND'));
    }
    if (member.status !== 'ACTIVE') {
        return next(new AppError(
            `Cannot check in: member status is ${member.status}`,
            400,
            'MEMBER_NOT_ACTIVE'
        ));
    }

    const activeMembership = await prisma.membership.findFirst({
        where: {
            member_id,
            status: 'ACTIVE',
            start_date: { lte: new Date() },
            end_date: { gte: new Date() },
        },
        select: { id: true },
    });
    if (!activeMembership) {
        return next(new AppError(
            'Member has no active membership covering today',
            403,
            'NO_ACTIVE_MEMBERSHIP'
        ));
    }

    const openAttendance = await prisma.attendance.findFirst({
        where: { member_id, checked_out: null },
        select: { id: true },
    });
    if (openAttendance) {
        return next(new AppError(
            'Member is already checked in. Check out first before a new check-in.',
            409,
            'ALREADY_CHECKED_IN',
            { attendanceId: openAttendance.id }
        ));
    }

    try {
        const attendance = await prisma.attendance.create({
            data: {
                gym_id,
                member: { connect: { id: member_id } },
                method,
                nonce,
            },
        });
        return new ApiResponse(res, 201, {
            attendance,
            member: { id: member.id, name: member.name },
        }, 'Checked in successfully.');
    } catch (error) {
        if (error.code === 'P2002') {
            return next(new AppError(
                'This QR code has already been used (replay detected)',
                409,
                'QR_REPLAY'
            ));
        }
        throw error;
    }
}

async function checkOut(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const attendance = await prisma.attendance.findFirst({
            where: { id, gym_id },
        });
        if (!attendance) {
            return next(new AppError('Attendance record not found', 404, 'ATTENDANCE_NOT_FOUND'));
        }
        if (attendance.checked_out) {
            return next(new AppError('This attendance has already been checked out', 409, 'ALREADY_CHECKED_OUT'));
        }

        const checkedOut = new Date();
        const durationMinutes = Math.max(1, Math.round((checkedOut - attendance.checked_in) / 60000));

        const updated = await prisma.attendance.update({
            where: { id },
            data: { checked_out: checkedOut, durationMinutes },
        });

        return new ApiResponse(res, 200, { attendance: updated }, 'Checked out successfully.');
    } catch (error) {
        console.error('Error checking out:', error);
        return next(error);
    }
}

async function getAttendances(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { member_id, method, from, to, open } = req.query;

        const where = { gym_id };
        if (member_id) where.member_id = member_id;
        if (method) where.method = method;
        if (open === 'true') where.checked_out = null;
        if (from || to) {
            where.checked_in = {};
            if (from) where.checked_in.gte = new Date(from);
            if (to) where.checked_in.lte = new Date(to);
        }

        const [attendances, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                skip,
                take: limit,
                orderBy: { checked_in: 'desc' },
                include: {
                    member: { select: { id: true, name: true, user: { select: { phone: true } } } },
                },
            }),
            prisma.attendance.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            attendances,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Attendance records fetched successfully.');
    } catch (error) {
        console.error('Error fetching attendance:', error);
        return next(error);
    }
}

async function getAttendanceById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const attendance = await prisma.attendance.findFirst({
            where: { id, gym_id },
            include: {
                member: { select: { id: true, name: true, user: { select: { phone: true, email: true } } } },
            },
        });

        if (!attendance) {
            return next(new AppError('Attendance record not found', 404, 'ATTENDANCE_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { attendance }, 'Attendance record fetched successfully.');
    } catch (error) {
        console.error('Error fetching attendance:', error);
        return next(error);
    }
}

async function selfGenerateQr(req, res, next) {
    try {
        const { id: memberId, gym_id } = await resolveMemberIdForUser(req);

        const member = await prisma.member.findFirst({
            where: { id: memberId, gym_id },
            select: { id: true, name: true, status: true },
        });
        if (!member) {
            return next(new AppError('Member not found', 404, 'MEMBER_NOT_FOUND'));
        }
        if (member.status !== 'ACTIVE') {
            return next(new AppError(
                `Cannot issue QR: your member status is ${member.status}`,
                400,
                'MEMBER_NOT_ACTIVE'
            ));
        }

        const nonce = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign(
            { member_id: member.id, gym_id, nonce, typ: 'attendance' },
            QR_SECRET,
            { expiresIn: QR_EXPIRATION }
        );

        return new ApiResponse(res, 200, {
            token,
            expiresIn: QR_EXPIRATION,
            member: { id: member.id, name: member.name },
        }, 'Your QR token generated successfully.');
    } catch (error) {
        return next(error);
    }
}

async function selfCheckIn(req, res, next) {
    try {
        const { id: memberId, gym_id } = await resolveMemberIdForUser(req);
        return await recordCheckIn(req, res, next, {
            gym_id,
            member_id: memberId,
            method: 'MANUAL',
            nonce: crypto.randomBytes(16).toString('hex'),
        });
    } catch (error) {
        return next(error);
    }
}

async function selfCheckOut(req, res, next) {
    try {
        const { id: memberId, gym_id } = await resolveMemberIdForUser(req);

        const open = await prisma.attendance.findFirst({
            where: { member_id: memberId, gym_id, checked_out: null },
            orderBy: { checked_in: 'desc' },
        });
        if (!open) {
            return next(new AppError(
                'No open check-in found to close',
                404,
                'NO_OPEN_CHECKIN'
            ));
        }

        const now = new Date();
        const durationMinutes = Math.max(1, Math.round((now - open.checked_in) / 60000));

        const updated = await prisma.attendance.update({
            where: { id: open.id },
            data: { checked_out: now, durationMinutes },
        });

        return new ApiResponse(res, 200, { attendance: updated }, 'Checked out successfully.');
    } catch (error) {
        return next(error);
    }
}

async function getMyAttendance(req, res, next) {
    try {
        const { id: memberId, gym_id } = await resolveMemberIdForUser(req);

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { from, to, open } = req.query;

        const where = { gym_id, member_id: memberId };
        if (open === 'true') where.checked_out = null;
        if (from || to) {
            where.checked_in = {};
            if (from) where.checked_in.gte = new Date(from);
            if (to) where.checked_in.lte = new Date(to);
        }

        const [attendances, total, openCheckin] = await Promise.all([
            prisma.attendance.findMany({
                where,
                skip,
                take: limit,
                orderBy: { checked_in: 'desc' },
            }),
            prisma.attendance.count({ where }),
            prisma.attendance.findFirst({
                where: { gym_id, member_id: memberId, checked_out: null },
                select: { id: true, checked_in: true, method: true },
            }),
        ]);

        return new ApiResponse(res, 200, {
            attendances,
            currentlyCheckedIn: openCheckin,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Your attendance records fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    generateQrToken,
    checkInWithQr,
    checkInManual,
    checkOut,
    getAttendances,
    getAttendanceById,
    selfGenerateQr,
    selfCheckIn,
    selfCheckOut,
    getMyAttendance,
};
