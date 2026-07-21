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

async function createBooking(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { class_id, member_id } = req.body;

        const klass = await prisma.class.findFirst({
            where: { id: class_id, gym_id },
        });
        if (!klass) {
            return next(new AppError('Class not found in your gym', 404, 'CLASS_NOT_FOUND'));
        }
        if (klass.starts_at <= new Date()) {
            return next(new AppError('Cannot book a class that has already started', 400, 'CLASS_ALREADY_STARTED'));
        }

        const member = await prisma.member.findFirst({
            where: { id: member_id, gym_id },
            select: { id: true, name: true, status: true },
        });
        if (!member) {
            return next(new AppError('Member not found in your gym', 404, 'MEMBER_NOT_FOUND'));
        }
        if (member.status !== 'ACTIVE') {
            return next(new AppError(
                `Cannot book: member status is ${member.status}`,
                400,
                'MEMBER_NOT_ACTIVE'
            ));
        }

        const activeMembership = await prisma.membership.findFirst({
            where: {
                member_id,
                status: 'ACTIVE',
                start_date: { lte: klass.starts_at },
                end_date: { gte: klass.starts_at },
            },
            select: { id: true },
        });
        if (!activeMembership) {
            return next(new AppError(
                'Member has no active membership covering the class date',
                403,
                'NO_ACTIVE_MEMBERSHIP'
            ));
        }

        const existing = await prisma.booking.findUnique({
            where: { class_id_member_id: { class_id, member_id } },
        });
        if (existing && existing.status !== 'CANCELLED') {
            return next(new AppError(
                `Member is already ${existing.status.toLowerCase()} for this class`,
                409,
                'ALREADY_BOOKED',
                { status: existing.status }
            ));
        }

        const confirmedCount = await prisma.booking.count({
            where: { class_id, status: 'CONFIRMED' },
        });
        const nextStatus = confirmedCount < klass.capacity ? 'CONFIRMED' : 'WAITLISTED';

        const bookingData = {
            gym: { connect: { id: gym_id } },
            class: { connect: { id: class_id } },
            member: { connect: { id: member_id } },
            status: nextStatus,
            starts_at: klass.starts_at,
            ends_at: klass.ends_at,
        };

        const booking = existing
            ? await prisma.booking.update({
                  where: { id: existing.id },
                  data: { status: nextStatus, starts_at: klass.starts_at, ends_at: klass.ends_at },
              })
            : await prisma.booking.create({ data: bookingData });

        return new ApiResponse(res, 201, {
            booking,
            message: nextStatus === 'WAITLISTED' ? 'Class is full — added to waitlist.' : undefined,
        }, nextStatus === 'CONFIRMED' ? 'Booking confirmed.' : 'Added to waitlist.');
    } catch (error) {
        console.error('Error creating booking:', error);
        return next(error);
    }
}

async function getBookings(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { class_id, member_id, status, from, to } = req.query;

        const where = { gym_id };
        if (class_id) where.class_id = class_id;
        if (member_id) where.member_id = member_id;
        if (status) where.status = status;
        if (from || to) {
            where.starts_at = {};
            if (from) where.starts_at.gte = new Date(from);
            if (to) where.starts_at.lte = new Date(to);
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                skip,
                take: limit,
                orderBy: { starts_at: 'asc' },
                include: {
                    class: { select: { id: true, name: true, trainer_id: true } },
                    member: { select: { id: true, name: true, user: { select: { phone: true } } } },
                },
            }),
            prisma.booking.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            bookings,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Bookings fetched successfully.');
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return next(error);
    }
}

async function getBookingById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const booking = await prisma.booking.findFirst({
            where: { id, gym_id },
            include: {
                class: { include: { trainer: { select: { id: true, name: true } } } },
                member: { select: { id: true, name: true, user: { select: { phone: true, email: true } } } },
            },
        });

        if (!booking) {
            return next(new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { booking }, 'Booking fetched successfully.');
    } catch (error) {
        console.error('Error fetching booking:', error);
        return next(error);
    }
}

async function cancelBooking(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const booking = await prisma.booking.findFirst({
            where: { id, gym_id },
        });
        if (!booking) {
            return next(new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND'));
        }
        if (booking.status === 'CANCELLED') {
            return next(new AppError('Booking is already cancelled', 409, 'ALREADY_CANCELLED'));
        }

        const wasConfirmed = booking.status === 'CONFIRMED';

        const [cancelled, promoted] = await prisma.$transaction(async (tx) => {
            const updated = await tx.booking.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });

            let promotedBooking = null;
            if (wasConfirmed) {
                const nextInLine = await tx.booking.findFirst({
                    where: { class_id: booking.class_id, status: 'WAITLISTED' },
                    orderBy: { created_at: 'asc' },
                });
                if (nextInLine) {
                    promotedBooking = await tx.booking.update({
                        where: { id: nextInLine.id },
                        data: { status: 'CONFIRMED' },
                    });
                }
            }

            return [updated, promotedBooking];
        });

        return new ApiResponse(res, 200, {
            booking: cancelled,
            promoted,
        }, promoted
            ? 'Booking cancelled. A waitlisted member was promoted to confirmed.'
            : 'Booking cancelled.');
    } catch (error) {
        console.error('Error cancelling booking:', error);
        return next(error);
    }
}

module.exports = {
    createBooking,
    getBookings,
    getBookingById,
    cancelBooking,
};
