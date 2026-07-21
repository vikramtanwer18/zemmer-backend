const AppError = require('../utils/appError');

function buildErrorResponse(err, req) {
    let statusCode = err.statusCode || 500;
    let errorCode = err.errorCode || 'INTERNAL_ERROR';
    let message = err.message || 'Something went wrong';
    let details = err.details && Object.keys(err.details).length ? err.details : undefined;

    if (err instanceof AppError) {
        return { statusCode, errorCode, message, details };
    }

    if (err && err.isJoi === true && Array.isArray(err.details)) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = err.details[0]?.message || 'Validation failed';
        details = err.details.reduce((acc, d) => {
            const key = (d.path && d.path.join('.')) || 'body';
            acc[key] = d.message.replace(/"/g, "'");
            return acc;
        }, {});
        return { statusCode, errorCode, message, details };
    }

    if (err && typeof err.code === 'string' && err.code.startsWith('P')) {
        if (err.code === 'P2002') {
            const target = err.meta && err.meta.target;
            const fields = Array.isArray(target) ? target : (target ? [target] : []);
            return {
                statusCode: 409,
                errorCode: 'UNIQUE_CONSTRAINT',
                message: fields.length
                    ? `A record with this ${fields.join(', ')} already exists`
                    : 'A record with these values already exists',
                details: fields.length ? fields.reduce((acc, f) => { acc[f] = 'already in use'; return acc; }, {}) : undefined,
            };
        }
        if (err.code === 'P2003') {
            return {
                statusCode: 409,
                errorCode: 'FOREIGN_KEY_CONSTRAINT',
                message: 'Operation conflicts with related records',
                details: err.meta && err.meta.field_name ? { field: err.meta.field_name } : undefined,
            };
        }
        if (err.code === 'P2025') {
            return {
                statusCode: 404,
                errorCode: 'RECORD_NOT_FOUND',
                message: (err.meta && err.meta.cause) || 'Requested record was not found',
            };
        }
        if (err.code === 'P2014') {
            return {
                statusCode: 409,
                errorCode: 'RELATION_VIOLATION',
                message: 'The change would violate a required relation',
            };
        }
    }

    if (err && err.name === 'PrismaClientValidationError') {
        const text = err.message || '';
        const missing = text.match(/Argument `(\w+)` is missing/);
        const unknown = text.match(/Unknown argument `(\w+)`/);
        const invalidEnum = text.match(/Invalid value for argument `(\w+)`\. Expected `?(\w+)`?/);
        const invalidType = text.match(/Argument `(\w+)`: Invalid value provided\. Expected ([^,\.]+)/);

        if (missing) {
            return {
                statusCode: 400,
                errorCode: 'PRISMA_VALIDATION_ERROR',
                message: `Required field '${missing[1]}' is missing`,
                details: { [missing[1]]: 'is required' },
            };
        }
        if (unknown) {
            return {
                statusCode: 400,
                errorCode: 'PRISMA_VALIDATION_ERROR',
                message: `Unknown field '${unknown[1]}' in request`,
                details: { [unknown[1]]: 'is not a valid field' },
            };
        }
        if (invalidEnum) {
            return {
                statusCode: 400,
                errorCode: 'PRISMA_VALIDATION_ERROR',
                message: `Invalid value for '${invalidEnum[1]}'. Expected one of the allowed ${invalidEnum[2]} values.`,
                details: { [invalidEnum[1]]: `expected ${invalidEnum[2]}` },
            };
        }
        if (invalidType) {
            return {
                statusCode: 400,
                errorCode: 'PRISMA_VALIDATION_ERROR',
                message: `Invalid value for '${invalidType[1]}'. Expected ${invalidType[2].trim()}.`,
                details: { [invalidType[1]]: `expected ${invalidType[2].trim()}` },
            };
        }
        return {
            statusCode: 400,
            errorCode: 'PRISMA_VALIDATION_ERROR',
            message: 'Invalid data shape sent to database',
            details: process.env.NODE_ENV === 'development' ? { prismaMessage: text } : undefined,
        };
    }

    if (err && err.name === 'JsonWebTokenError') {
        return { statusCode: 401, errorCode: 'TOKEN_INVALID', message: 'Invalid token' };
    }
    if (err && err.name === 'TokenExpiredError') {
        return { statusCode: 401, errorCode: 'TOKEN_EXPIRED', message: 'Token has expired' };
    }

    if (err && err.name === 'MulterError') {
        const map = {
            LIMIT_FILE_SIZE: { code: 'FILE_TOO_LARGE', msg: 'Uploaded file exceeds the maximum allowed size' },
            LIMIT_UNEXPECTED_FILE: { code: 'UNEXPECTED_FILE_FIELD', msg: `Unexpected file field '${err.field}'` },
            LIMIT_FILE_COUNT: { code: 'TOO_MANY_FILES', msg: 'Too many files uploaded' },
            LIMIT_FIELD_COUNT: { code: 'TOO_MANY_FIELDS', msg: 'Too many form fields' },
            LIMIT_PART_COUNT: { code: 'TOO_MANY_PARTS', msg: 'Too many parts in multipart payload' },
        };
        const meta = map[err.code] || { code: 'UPLOAD_ERROR', msg: err.message || 'File upload failed' };
        return {
            statusCode: 400,
            errorCode: meta.code,
            message: meta.msg,
            details: err.field ? { field: err.field } : undefined,
        };
    }

    if (err && err.type === 'entity.parse.failed') {
        return {
            statusCode: 400,
            errorCode: 'INVALID_JSON',
            message: 'Request body is not valid JSON',
        };
    }

    if (err && err.type === 'entity.too.large') {
        return {
            statusCode: 413,
            errorCode: 'PAYLOAD_TOO_LARGE',
            message: 'Request body is too large',
        };
    }

    return { statusCode, errorCode, message, details };
}

function globalErrorHandler(err, req, res, next) {
    const { statusCode, errorCode, message, details } = buildErrorResponse(err, req);

    const isServerError = statusCode >= 500;
    if (isServerError) {
        console.error(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode} ${errorCode}`,
            err
        );
    } else if (process.env.NODE_ENV === 'development') {
        console.warn(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode} ${errorCode}: ${message}`
        );
    }

    const body = {
        success: false,
        status: 'error',
        statusCode,
        errorCode,
        message: isServerError && process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred. Please try again.'
            : message,
    };
    if (details) body.details = details;

    if (process.env.NODE_ENV === 'development' && err.stack) {
        body.stack = err.stack.split('\n').slice(0, 10);
    }

    res.status(statusCode).json(body);
}

module.exports = globalErrorHandler;
