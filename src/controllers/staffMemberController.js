const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { sendStaffWelcomeEmail } = require('../utils/sendEmail');

const STAFF_USER_SELECT = {
    id: true,
    email: true,
    phone: true,
    role: true,
    isVerified: true,
};

const STAFF_INCLUDE_USER = {
    user: { select: STAFF_USER_SELECT },
};

function generateRandomPassword() {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

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

async function createStaffMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { name, email, phone, address, dob, sex, role, hourlyPrice, bio, certificate } = req.body;

        const phoneClash = await prisma.user.findFirst({
            where: { gym_id, phone },
            select: { id: true },
        });
        if (phoneClash) {
            return next(new AppError(
                'A user with this phone number already exists in your gym',
                409,
                'PHONE_IN_USE',
                { phone: 'Phone number already registered' }
            ));
        }

        const emailClash = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (emailClash) {
            return next(new AppError(
                'A user with this email already exists',
                409,
                'EMAIL_IN_USE',
                { email: 'Email already in use' }
            ));
        }

        const tempPassword = generateRandomPassword();
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(tempPassword, salt);

        const gym = await prisma.gym.findUnique({
            where: { id: gym_id },
            select: { name: true },
        });

        console.log("here is the temp password for the staff member", tempPassword);

        const staff = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    email,
                    phone,
                    password_hash: passwordHash,
                    isVerified: true,
                    role,
                },
            });
            return tx.staffMember.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    user: { connect: { id: user.id } },
                    name,
                    address,
                    dob: new Date(dob),
                    sex,
                    hourlyPrice,
                    bio: bio || null,
                    certificate: certificate || null,
                },
                include: STAFF_INCLUDE_USER,
            });
        });

        try {
            await sendStaffWelcomeEmail({
                to: email,
                name,
                gymName: (gym && gym.name) || 'your gym',
                role,
                loginEmail: email,
                password: tempPassword,
            });
        } catch (emailError) {
            console.error('Staff welcome email failed:', emailError);
        }

        return new ApiResponse(res, 201, { staff }, 'Staff member created. Login credentials emailed.');
    } catch (error) {
        return next(error);
    }
}

async function getStaffMembers(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { sex, role, search } = req.query;

        const where = { gym_id };
        if (sex) where.sex = sex;
        if (role) where.user = { role };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { user: { phone: { contains: search } } },
            ];
        }

        const [staff, total] = await Promise.all([
            prisma.staffMember.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: STAFF_INCLUDE_USER,
            }),
            prisma.staffMember.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            staff,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Staff members fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function getStaffMemberById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const staff = await prisma.staffMember.findFirst({
            where: { id, gym_id },
            include: STAFF_INCLUDE_USER,
        });

        if (!staff) {
            return next(new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { staff }, 'Staff member fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function updateStaffMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { name, email, phone, address, dob, sex, role, hourlyPrice, bio, certificate } = req.body;

        const existing = await prisma.staffMember.findFirst({
            where: { id, gym_id },
            select: { id: true, user_id: true },
        });
        if (!existing) {
            return next(new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND'));
        }

        if (email && existing.user_id) {
            const emailClash = await prisma.user.findFirst({
                where: { email, NOT: { id: existing.user_id } },
                select: { id: true },
            });
            if (emailClash) {
                return next(new AppError(
                    'Another user already uses this email',
                    409,
                    'EMAIL_IN_USE',
                    { email: 'Email already in use' }
                ));
            }
        }

        if (phone && existing.user_id) {
            const phoneClash = await prisma.user.findFirst({
                where: { gym_id, phone, NOT: { id: existing.user_id } },
                select: { id: true },
            });
            if (phoneClash) {
                return next(new AppError(
                    'Another user already uses this phone number',
                    409,
                    'PHONE_IN_USE',
                    { phone: 'Phone number already registered' }
                ));
            }
        }

        const staffData = {};
        if (name !== undefined) staffData.name = name;
        if (address !== undefined) staffData.address = address;
        if (dob !== undefined) staffData.dob = new Date(dob);
        if (sex !== undefined) staffData.sex = sex;
        if (hourlyPrice !== undefined) staffData.hourlyPrice = hourlyPrice;
        if (bio !== undefined) staffData.bio = bio || null;
        if (certificate !== undefined) staffData.certificate = certificate || null;

        const userData = {};
        if (email !== undefined) userData.email = email;
        if (phone !== undefined) userData.phone = phone;
        if (role !== undefined) userData.role = role;

        const staff = await prisma.$transaction(async (tx) => {
            if (Object.keys(userData).length && existing.user_id) {
                await tx.user.update({
                    where: { id: existing.user_id },
                    data: userData,
                });
            }
            return tx.staffMember.update({
                where: { id },
                data: staffData,
                include: STAFF_INCLUDE_USER,
            });
        });

        return new ApiResponse(res, 200, { staff }, 'Staff member updated successfully.');
    } catch (error) {
        return next(error);
    }
}

async function deleteStaffMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.staffMember.findFirst({
            where: { id, gym_id },
            select: { id: true, user_id: true },
        });
        if (!existing) {
            return next(new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND'));
        }

        await prisma.$transaction(async (tx) => {
            await tx.staffMember.delete({ where: { id } });
            if (existing.user_id) {
                await tx.user.delete({ where: { id: existing.user_id } }).catch(() => { /* user may already be gone */ });
            }
        });

        return new ApiResponse(res, 200, null, 'Staff member and login revoked successfully.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    createStaffMember,
    getStaffMembers,
    getStaffMemberById,
    updateStaffMember,
    deleteStaffMember,
};
