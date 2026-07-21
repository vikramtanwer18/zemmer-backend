const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { hashToken } = require('../utils/tokenHash');

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, gym_id: user.gym_id },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, gym_id: user.gym_id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
    );
};

async function issueUserSession(res, user) {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: hashToken(refreshToken) },
    });

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    return { accessToken };
}

async function loginUser(req, res, next) {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_FAILED', { email: 'Email not found' }));
        }

        const isAdmin = user.role === 'ADMIN';
        if (isAdmin) {
            return next(new AppError('Admin login not allowed here', 403, 'ADMIN_LOGIN_NOT_ALLOWED'));
        }

        if (!user.isVerified) {
            return next(new AppError(
                'Email not verified',
                401,
                'EMAIL_NOT_VERIFIED',
                { email: 'Please verify your email before logging in' }
            ));
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return next(new AppError('Invalid email or password', 401, 'AUTH_FAILED', { password: 'Incorrect password' }));
        }

        const { accessToken } = await issueUserSession(res, user);

        return new ApiResponse(res, 200, {
            user: { id: user.id, email: user.email, role: user.role },
            accessToken,
        }, 'Login successful.');
    } catch (error) {
        console.error('Login error:', error);
        next(error);
    }
}

async function refreshAccessToken(req, res, next) {
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

        if (decoded.role === 'ADMIN') {
            return next(new AppError('Invalid refresh token for user', 401, 'REFRESH_TOKEN_INVALID'));
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
        });
        if (!user) {
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return next(new AppError('User no longer exists', 401, 'USER_NOT_FOUND'));
        }

        if (!user.refreshToken || user.refreshToken !== hashToken(token)) {
            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: null },
            });
            res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
            return next(new AppError(
                'Refresh token reuse detected. Please log in again.',
                401,
                'REFRESH_TOKEN_REUSED'
            ));
        }

        const { accessToken } = await issueUserSession(res, user);

        return new ApiResponse(res, 200, {
            user: { id: user.id, email: user.email, role: user.role },
            accessToken,
        }, 'Access token refreshed.');
    } catch (error) {
        console.error('Refresh error:', error);
        return next(error);
    }
}

async function logoutUser(req, res, next) {
    try {
        if (req.user && req.user.id) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { refreshToken: null },
            }).catch(() => { /* user may already be gone; ignore */ });
        }
        res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
        return new ApiResponse(res, 200, null, 'Logout successful.');
    } catch (error) {
        console.error('Logout error:', error);
        next(new AppError('Logout failed', 500, 'LOGOUT_FAILED'));
    }
}

module.exports = {
    loginUser,
    refreshAccessToken,
    logoutUser,
};
