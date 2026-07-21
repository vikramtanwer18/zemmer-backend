const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    console.log('Authorization Header:', authHeader); // Debugging line to check the authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError('Authorization header missing or malformed', 401, 'AUTH_HEADER_MISSING'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return next(new AppError('Access token not provided', 401, 'TOKEN_MISSING'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            gym_id: decoded.gym_id,
        };
        return next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Access token has expired', 401, 'TOKEN_EXPIRED'));
        }
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid access token', 401, 'TOKEN_INVALID'));
        }
        return next(new AppError('Authentication failed', 401, 'AUTH_FAILED'));
    }
}

function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED'));
        }
        if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
            return next(new AppError('You do not have permission to perform this action', 403, 'FORBIDDEN'));
        }
        return next();
    };
}

module.exports = { authenticate, authorize };
