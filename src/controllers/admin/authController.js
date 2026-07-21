const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const ApiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/appError');
const { sendOtpEmail } = require('../../utils/sendEmail');
const { hashToken } = require('../../utils/tokenHash');
const { getOTPExpiryIST, getNowIST } = require('../../utils/timezone');

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

const generateAdminAccessToken = (admin) => {
    return jwt.sign(
        { id: admin.id, email: admin.email, role: 'ADMIN' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
    );
};

const generateAdminRefreshToken = (admin) => {
    return jwt.sign(
        { id: admin.id, email: admin.email, role: 'ADMIN' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
    );
};

function generateOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

async function findAdminByEmail(email) {
    return prisma.user.findFirst({
        where: { email, role: 'ADMIN' },
    });
}

async function findAdminById(id) {
    return prisma.user.findFirst({
        where: { id, role: 'ADMIN' },
    });
}

async function issueAdminSession(res, admin) {
    const accessToken = generateAdminAccessToken(admin);
    const refreshToken = generateAdminRefreshToken(admin);

    await prisma.user.update({
        where: { id: admin.id },
        data: { refreshToken: hashToken(refreshToken) },
    });

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return { accessToken };
}

async function loginAdmin(req, res, next) {
    try {
        const { email, password } = req.body;

        const admin = await findAdminByEmail(email);
        if (!admin) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_FAILED'));
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_FAILED'));
        }

        const otp = generateOtp();
        const expiresInMinutes = parseInt(process.env.OTP_EXPIRATION, 10) || 10;
        const expiresAt = getOTPExpiryIST(expiresInMinutes);

        await prisma.user.update({
            where: { id: admin.id },
            data: { otp, expiresAt },
        });

        try {
            await sendOtpEmail({
                to: admin.email,
                name: admin.email.split('@')[0],
                otp,
                expiresInMinutes,
                gymName: 'Admin Portal',
            });
        } catch (emailError) {
            console.error('Failed to send admin OTP email:', emailError);
            return next(new AppError(
                'Could not send OTP email. Please try again.',
                502,
                'EMAIL_SEND_FAILED'
            ));
        }

        return new ApiResponse(res, 200, {
            email: admin.email,
            expiresInMinutes,
        }, 'OTP sent to your email. Submit it to complete login.');
    } catch (error) {
        return next(error);
    }
}

async function verifyAdminOtp(req, res, next) {
    try {
        const { email, otp } = req.body;

        const admin = await findAdminByEmail(email);
        if (!admin) {
            return next(new AppError('Invalid email or OTP', 401, 'AUTH_FAILED'));
        }
        if (!admin.otp || !admin.expiresAt) {
            return next(new AppError('No OTP pending. Start the login again.', 400, 'NO_OTP_PENDING'));
        }
        if (admin.expiresAt < getNowIST()) {
            await prisma.user.update({
                where: { id: admin.id },
                data: { otp: null, expiresAt: null },
            });
            return next(new AppError('OTP has expired. Start the login again.', 400, 'OTP_EXPIRED'));
        }
        if (admin.otp !== otp) {
            return next(new AppError('Invalid OTP', 400, 'INVALID_OTP'));
        }

        await prisma.user.update({
            where: { id: admin.id },
            data: { otp: null, expiresAt: null },
        });

        const { accessToken } = await issueAdminSession(res, admin);

        return new ApiResponse(res, 200, {
            admin: { id: admin.id, email: admin.email, role: admin.role },
            accessToken,
        }, 'Admin login successful.');
    } catch (error) {
        return next(error);
    }
}

async function resendAdminOtp(req, res, next) {
    try {
        const { email } = req.body;

        const admin = await findAdminByEmail(email);
        if (!admin) {
            return new ApiResponse(res, 200, null, 'If an account exists, a new OTP has been sent.');
        }

        const otp = generateOtp();
        const expiresInMinutes = parseInt(process.env.OTP_EXPIRATION, 10) || 10;
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        await prisma.user.update({
            where: { id: admin.id },
            data: { otp, expiresAt },
        });

        try {
            await sendOtpEmail({
                to: admin.email,
                name: admin.email.split('@')[0],
                otp,
                expiresInMinutes,
                gymName: 'Admin Portal',
            });
        } catch (emailError) {
            console.error('Failed to resend admin OTP email:', emailError);
            return next(new AppError('Could not send OTP email.', 502, 'EMAIL_SEND_FAILED'));
        }

        return new ApiResponse(res, 200, { email: admin.email, expiresInMinutes }, 'A new OTP has been sent.');
    } catch (error) {
        return next(error);
    }
}

async function refreshAdminToken(req, res, next) {
    try {
        const token = req.cookies && req.cookies.refreshToken;
        if (!token) {
            return next(new AppError('No refresh token provided', 401, 'REFRESH_TOKEN_MISSING'));
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        } catch (err) {
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            const code = err.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'REFRESH_TOKEN_INVALID';
            const msg = err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token';
            return next(new AppError(msg, 401, code));
        }

        if (decoded.role !== 'ADMIN') {
            return next(new AppError('Invalid refresh token for admin', 401, 'REFRESH_TOKEN_INVALID'));
        }

        const admin = await findAdminById(decoded.id);
        if (!admin) {
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return next(new AppError('Admin no longer exists', 401, 'ADMIN_NOT_FOUND'));
        }

        if (!admin.refreshToken || admin.refreshToken !== hashToken(token)) {
            await prisma.user.update({
                where: { id: admin.id },
                data: { refreshToken: null },
            });
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return next(new AppError(
                'Refresh token reuse detected. Please log in again.',
                401,
                'REFRESH_TOKEN_REUSED'
            ));
        }

        const { accessToken } = await issueAdminSession(res, admin);

        return new ApiResponse(res, 200, {
            admin: { id: admin.id, email: admin.email, role: admin.role },
            accessToken,
        }, 'Admin access token refreshed.');
    } catch (error) {
        return next(error);
    }
}

async function logoutAdmin(req, res, next) {
    try {
        if (req.user && req.user.id) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { refreshToken: null },
            }).catch(() => { /* admin may already be gone; ignore */ });
        }
        res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
        return new ApiResponse(res, 200, null, 'Admin logout successful.');
    } catch (error) {
        return next(new AppError('Logout failed', 500, 'LOGOUT_FAILED'));
    }
}

module.exports = {
    loginAdmin,
    verifyAdminOtp,
    resendAdminOtp,
    refreshAdminToken,
    logoutAdmin,
};
