const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const {
    buildPublicUrl,
    safeUnlink,
    relativePathFromMulterFile,
    absolutePathFromRelative,
} = require('../middlewares/upload');

const GYM_SELECT = {
    id: true,
    name: true,
    subdomain: true,
    address: true,
    city: true,
    noOfBranches: true,
    noOfMembers: true,
    logoUrl: true,
    coverImageUrl: true,
    saasPlanId: true,
    created_at: true,
    updated_at: true,
    saasPlan: {
        select: {
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
        },
    },
};

const OWNER_SELECT = {
    id: true,
    email: true,
    phone: true,
    role: true,
    isVerified: true,
    gym_id: true,
    created_at: true,
};

function withImageUrls(req, gym) {
    if (!gym) return gym;
    return {
        ...gym,
        logoUrl: buildPublicUrl(req, gym.logoUrl),
        coverImageUrl: buildPublicUrl(req, gym.coverImageUrl),
    };
}

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

async function getMyGymProfile(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);

        const [gym, owner] = await Promise.all([
            prisma.gym.findUnique({
                where: { id: gym_id },
                select: GYM_SELECT,
            }),
            prisma.user.findUnique({
                where: { id: req.user.id },
                select: OWNER_SELECT,
            }),
        ]);

        if (!gym) {
            return next(new AppError('Gym not found', 404, 'GYM_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, {
            gym: withImageUrls(req, gym),
            currentUser: owner,
        }, 'Gym profile fetched successfully.');
    } catch (error) {
        return next(error);
    }
}

async function updateMyGymProfile(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const {
            name,
            subdomain,
            address,
            city,
            noOfBranches,
            noOfMembers,
        } = req.body;

        if (subdomain !== undefined && subdomain !== null && subdomain !== '') {
            const clash = await prisma.gym.findFirst({
                where: { subdomain, NOT: { id: gym_id } },
                select: { id: true },
            });
            if (clash) {
                return next(new AppError(
                    'This subdomain is already taken',
                    409,
                    'SUBDOMAIN_IN_USE',
                    { subdomain: 'already in use' }
                ));
            }
        }

        const data = {};
        if (name !== undefined) data.name = name;
        if (subdomain !== undefined) data.subdomain = subdomain || null;
        if (address !== undefined) data.address = address;
        if (city !== undefined) data.city = city;
        if (noOfBranches !== undefined) data.noOfBranches = noOfBranches;
        if (noOfMembers !== undefined) data.noOfMembers = noOfMembers;

        const gym = await prisma.gym.update({
            where: { id: gym_id },
            data,
            select: GYM_SELECT,
        });

        return new ApiResponse(res, 200, { gym: withImageUrls(req, gym) }, 'Gym profile updated successfully.');
    } catch (error) {
        return next(error);
    }
}

async function uploadGymImage(req, res, next, field) {
    try {
        const gym_id = await resolveGymId(req);

        if (!req.file) {
            return next(new AppError(
                `No ${field === 'logoUrl' ? 'logo' : 'cover image'} file provided`,
                400,
                'FILE_REQUIRED'
            ));
        }

        const newRelative = relativePathFromMulterFile(req.file);

        const existing = await prisma.gym.findUnique({
            where: { id: gym_id },
            select: { [field]: true },
        });

        if (!existing) {
            safeUnlink(absolutePathFromRelative(newRelative));
            return next(new AppError('Gym not found', 404, 'GYM_NOT_FOUND'));
        }

        const gym = await prisma.gym.update({
            where: { id: gym_id },
            data: { [field]: newRelative },
            select: GYM_SELECT,
        });

        if (existing[field] && existing[field] !== newRelative) {
            safeUnlink(absolutePathFromRelative(existing[field]));
        }

        return new ApiResponse(res, 200, { gym: withImageUrls(req, gym) },
            `${field === 'logoUrl' ? 'Logo' : 'Cover image'} uploaded successfully.`);
    } catch (error) {
        if (req.file) safeUnlink(req.file.path);
        return next(error);
    }
}

const uploadGymLogo = (req, res, next) => uploadGymImage(req, res, next, 'logoUrl');
const uploadGymCover = (req, res, next) => uploadGymImage(req, res, next, 'coverImageUrl');

async function removeGymImage(req, res, next, field) {
    try {
        const gym_id = await resolveGymId(req);

        const existing = await prisma.gym.findUnique({
            where: { id: gym_id },
            select: { [field]: true },
        });
        if (!existing) {
            return next(new AppError('Gym not found', 404, 'GYM_NOT_FOUND'));
        }

        if (!existing[field]) {
            return new ApiResponse(res, 200, null, 'No image to remove.');
        }

        const gym = await prisma.gym.update({
            where: { id: gym_id },
            data: { [field]: null },
            select: GYM_SELECT,
        });

        safeUnlink(absolutePathFromRelative(existing[field]));

        return new ApiResponse(res, 200, { gym: withImageUrls(req, gym) },
            `${field === 'logoUrl' ? 'Logo' : 'Cover image'} removed successfully.`);
    } catch (error) {
        return next(error);
    }
}

const removeGymLogo = (req, res, next) => removeGymImage(req, res, next, 'logoUrl');
const removeGymCover = (req, res, next) => removeGymImage(req, res, next, 'coverImageUrl');

async function updateMyPassword(req, res, next) {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, password_hash: true },
        });
        if (!user) {
            return next(new AppError('User not found', 404, 'USER_NOT_FOUND'));
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return next(new AppError(
                'Current password is incorrect',
                401,
                'INVALID_CURRENT_PASSWORD',
                { currentPassword: 'Incorrect password' }
            ));
        }

        if (currentPassword === newPassword) {
            return next(new AppError(
                'New password must be different from current password',
                400,
                'PASSWORD_UNCHANGED',
                { newPassword: 'Choose a different password' }
            ));
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: userId },
            data: { password_hash: passwordHash, refreshToken: null },
        });

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });

        return new ApiResponse(res, 200, null, 'Password updated successfully. Please log in again.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getMyGymProfile,
    updateMyGymProfile,
    uploadGymLogo,
    uploadGymCover,
    removeGymLogo,
    removeGymCover,
    updateMyPassword,
};
