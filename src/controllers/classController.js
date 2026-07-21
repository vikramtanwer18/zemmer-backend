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

async function createClass(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { name, trainer_id, starts_at, ends_at, capacity, description } = req.body;

        const start = new Date(starts_at);
        const end = new Date(ends_at);
        if (end <= start) {
            return next(new AppError('ends_at must be after starts_at', 400, 'INVALID_DATE_RANGE'));
        }

        const trainer = await prisma.staffMember.findFirst({
            where: { id: trainer_id, gym_id },
            select: { id: true },
        });
        if (!trainer) {
            return next(new AppError('Trainer not found in your gym', 404, 'TRAINER_NOT_FOUND'));
        }

        const klass = await prisma.class.create({
            data: {
                gym: { connect: { id: gym_id } },
                name,
                trainer: { connect: { id: trainer_id } },
                starts_at: start,
                ends_at: end,
                capacity,
                description: description || '',
            },
        });

        return new ApiResponse(res, 201, { class: klass }, 'Class created successfully.');
    } catch (error) {
        console.error('Error creating class:', error);
        return next(error);
    }
}

async function getClasses(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { trainer_id, from, to, upcoming, search } = req.query;

        const where = { gym_id };
        if (trainer_id) where.trainer_id = trainer_id;
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (upcoming === 'true') where.starts_at = { gte: new Date() };
        if (from || to) {
            where.starts_at = where.starts_at || {};
            if (from) where.starts_at.gte = new Date(from);
            if (to) where.starts_at.lte = new Date(to);
        }

        const [classes, total] = await Promise.all([
            prisma.class.findMany({
                where,
                skip,
                take: limit,
                orderBy: { starts_at: 'asc' },
                include: {
                    trainer: { select: { id: true, name: true, user: { select: { role: true } } } },
                    _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
                },
            }),
            prisma.class.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            classes,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Classes fetched successfully.');
    } catch (error) {
        console.error('Error fetching classes:', error);
        return next(error);
    }
}

async function getClassById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const klass = await prisma.class.findFirst({
            where: { id, gym_id },
            include: {
                trainer: { select: { id: true, name: true, user: { select: { role: true, phone: true } } } },
                bookings: {
                    orderBy: { created_at: 'asc' },
                    include: { member: { select: { id: true, name: true, user: { select: { phone: true } } } } },
                },
                _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
            },
        });

        if (!klass) {
            return next(new AppError('Class not found', 404, 'CLASS_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { class: klass }, 'Class fetched successfully.');
    } catch (error) {
        console.error('Error fetching class:', error);
        return next(error);
    }
}

async function updateClass(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { name, trainer_id, starts_at, ends_at, capacity, description } = req.body;

        const existing = await prisma.class.findFirst({
            where: { id, gym_id },
        });
        if (!existing) {
            return next(new AppError('Class not found', 404, 'CLASS_NOT_FOUND'));
        }

        if (trainer_id) {
            const trainer = await prisma.staffMember.findFirst({
                where: { id: trainer_id, gym_id },
                select: { id: true },
            });
            if (!trainer) {
                return next(new AppError('Trainer not found in your gym', 404, 'TRAINER_NOT_FOUND'));
            }
        }

        const data = {};
        if (name !== undefined) data.name = name;
        if (trainer_id !== undefined) data.trainer = { connect: { id: trainer_id } };
        if (starts_at !== undefined) data.starts_at = new Date(starts_at);
        if (ends_at !== undefined) data.ends_at = new Date(ends_at);
        if (capacity !== undefined) data.capacity = capacity;
        if (description !== undefined) data.description = description;

        const newStart = data.starts_at || existing.starts_at;
        const newEnd = data.ends_at || existing.ends_at;
        if (newEnd <= newStart) {
            return next(new AppError('ends_at must be after starts_at', 400, 'INVALID_DATE_RANGE'));
        }

        if (capacity !== undefined) {
            const confirmedCount = await prisma.booking.count({
                where: { class_id: id, status: 'CONFIRMED' },
            });
            if (capacity < confirmedCount) {
                return next(new AppError(
                    `Cannot reduce capacity below ${confirmedCount} existing confirmed bookings`,
                    400,
                    'CAPACITY_TOO_LOW'
                ));
            }
        }

        const klass = await prisma.class.update({
            where: { id },
            data,
        });

        return new ApiResponse(res, 200, { class: klass }, 'Class updated successfully.');
    } catch (error) {
        console.error('Error updating class:', error);
        return next(error);
    }
}

async function deleteClass(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.class.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Class not found', 404, 'CLASS_NOT_FOUND'));
        }

        await prisma.class.delete({ where: { id } });

        return new ApiResponse(res, 200, null, 'Class deleted successfully.');
    } catch (error) {
        console.error('Error deleting class:', error);
        return next(error);
    }
}

module.exports = {
    createClass,
    getClasses,
    getClassById,
    updateClass,
    deleteClass,
};
