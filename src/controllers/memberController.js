const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { sendMemberWelcomeEmail } = require('../utils/sendEmail');

const MEMBER_USER_SELECT = {
    id: true,
    email: true,
    phone: true,
    isVerified: true,
    role: true,
};

const MEMBER_INCLUDE_USER = {
    user: { select: MEMBER_USER_SELECT },
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

async function registerMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { name, phone, email, dob, gender, notes, status } = req.body;

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
        console.log("Member password",tempPassword)
        const member = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    email,
                    phone,
                    password_hash: passwordHash,
                    isVerified: true,
                    role: 'MEMBER',
                },
            });
            return tx.member.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    user: { connect: { id: user.id } },
                    name,
                    dob: dob ? new Date(dob) : null,
                    gender,
                    notes: notes || null,
                    status: status || 'ACTIVE',
                },
                include: MEMBER_INCLUDE_USER,
            });
        });

        try {
            await sendMemberWelcomeEmail({
                to: email,
                name,
                gymName: (gym && gym.name) || 'your gym',
                loginEmail: email,
                password: tempPassword,
            });
        } catch (emailError) {
            console.error('Member welcome email failed:', emailError);
        }

        return new ApiResponse(res, 201, { member }, 'Member registered. Login credentials emailed to the member.');
    } catch (error) {
        return next(error);
    }
}

async function getMembers(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { status, search } = req.query;

        const where = { gym_id };
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { user: { phone: { contains: search } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [members, total] = await Promise.all([
            prisma.member.findMany({
                where,
                skip,
                take: limit,
                orderBy: { joined_on: 'desc' },
                include: MEMBER_INCLUDE_USER,
            }),
            prisma.member.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            members,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Members fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function getMemberById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const member = await prisma.member.findFirst({
            where: { id, gym_id },
            include: {
                user: { select: MEMBER_USER_SELECT },
                memberships: true,
            },
        });

        if (!member) {
            return next(new AppError('Member not found', 404, 'MEMBER_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { member }, 'Member fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function updateMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { name, phone, email, dob, gender, notes, status } = req.body;

        const existing = await prisma.member.findFirst({
            where: { id, gym_id },
            select: { id: true, user_id: true },
        });
        if (!existing) {
            return next(new AppError('Member not found', 404, 'MEMBER_NOT_FOUND'));
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

        const memberData = {};
        if (name !== undefined) memberData.name = name;
        if (dob !== undefined) memberData.dob = dob ? new Date(dob) : null;
        if (gender !== undefined) memberData.gender = gender;
        if (notes !== undefined) memberData.notes = notes || null;
        if (status !== undefined) memberData.status = status;

        const userData = {};
        if (phone !== undefined) userData.phone = phone;
        if (email !== undefined) userData.email = email;

        const member = await prisma.$transaction(async (tx) => {
            if (Object.keys(userData).length && existing.user_id) {
                await tx.user.update({
                    where: { id: existing.user_id },
                    data: userData,
                });
            }
            return tx.member.update({
                where: { id },
                data: memberData,
                include: MEMBER_INCLUDE_USER,
            });
        });

        return new ApiResponse(res, 200, { member }, 'Member updated successfully.');
    } catch (error) {
        return next(error);
    }
}

async function deleteMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.member.findFirst({
            where: { id, gym_id },
            select: { id: true, user_id: true },
        });
        if (!existing) {
            return next(new AppError('Member not found', 404, 'MEMBER_NOT_FOUND'));
        }

        await prisma.$transaction(async (tx) => {
            await tx.member.delete({ where: { id } });
            if (existing.user_id) {
                await tx.user.delete({ where: { id: existing.user_id } }).catch(() => { /* user may already be gone */ });
            }
        });

        return new ApiResponse(res, 200, null, 'Member and login revoked successfully.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    registerMember,
    getMembers,
    getMemberById,
    updateMember,
    deleteMember,
};
