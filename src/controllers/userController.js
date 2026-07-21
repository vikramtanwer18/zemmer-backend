
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const bcrypt = require('bcrypt');
const { sendOtpEmail, sendPasswordResetEmail } = require('../utils/sendEmail');
const { getNowIST, getFutureDateIST, getOTPExpiryIST } = require('../utils/timezone');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit OTP
}

async function registerGym(req, res, next) {
    try {
        const {
            gymName,
            ownerName,
            ownerEmail,
            ownerPhone = null,  // Optional phone number
            password,
        } = req.body;

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (existingUser) {
            return next(new AppError('A user with this email already exists', 400, 'EMAIL_IN_USE', { email: 'Email already in use' }));
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate OTP for email verification (in IST)
        const otp = generateOTP();
        const expiresInMinutes = parseInt(process.env.OTP_EXPIRATION, 10) || 10;
        const expiresAt = getOTPExpiryIST(expiresInMinutes);

        // Get TRIAL plan (auto-assign to new registrations)
        const trialPlan = await prisma.saasPlan.findUnique({
            where: { key: 'TRIAL' },
            select: { id: true },
        });

        if (!trialPlan) {
            return next(new AppError('TRIAL plan not found. Please contact support.', 500, 'TRIAL_PLAN_NOT_FOUND'));
        }

        // Create gym, user, and subscription in a transaction
        const { newGym, newUser, subscription } = await prisma.$transaction(async (tx) => {
            // 1. Create gym with minimal data (address, city, branches are optional, set later)
            const gym = await tx.gym.create({
                data: {
                    name: gymName,
                    // All other fields are optional and set later via profile update
                },
            });

            // 2. Create user with isVerified: false (can login but email not confirmed)
            const user = await tx.user.create({
                data: {
                    gym: { connect: { id: gym.id } },
                    email: ownerEmail,
                    phone: ownerPhone,
                    password_hash: hashedPassword,
                    isVerified: false,  // Email not verified yet
                    role: 'OWNER',
                    otp,  // Store OTP for verification
                    expiresAt,
                },
            });

            // 3. Auto-create TRIAL subscription (14 days free - in IST)
            const trialDays = parseInt(process.env.TRIAL_DAYS, 10) || 14;
            const nowIST = getNowIST();
            const trialEndsIST = getFutureDateIST(trialDays);

            const sub = await tx.subscription.create({
                data: {
                    gym: { connect: { id: gym.id } },
                    saasPlan: { connect: { id: trialPlan.id } },
                    status: 'TRIALING',
                    trialStartedAt: nowIST,
                    trialEndsAt: trialEndsIST,
                    currentPeriodStart: null,
                    currentPeriodEnd: null,
                },
                select: {
                    id: true,
                    status: true,
                    trialStartedAt: true,
                    trialEndsAt: true,
                    saasPlan: { select: { id: true, key: true, name: true } },
                },
            });

            return { newGym: gym, newUser: user, subscription: sub };
        });

        // Send OTP email
        try {
            await sendOtpEmail({
                to: ownerEmail,
                name: ownerName,
                otp,
                expiresInMinutes,
                gymName,
            });
        } catch (emailError) {
            console.error('Failed to send OTP email:', emailError);
            return next(new AppError(
                'Account created but verification email could not be sent. Please request a new OTP.',
                502,
                'EMAIL_SEND_FAILED'
            ));
        }

        return new ApiResponse(res, 201, {
            gym: { id: newGym.id, name: newGym.name },
            user: { id: newUser.id, email: newUser.email, isVerified: newUser.isVerified },
            subscription: {
                status: subscription.status,
                trialEndsAt: subscription.trialEndsAt,
                daysRemaining: 14,
            },
        }, 'Registration successful! Verify your email with the OTP sent. TRIAL plan activated for 14 days.');
    } catch (error) {
        return next(error);
    }
}

async function verifyEmail(req, res, next) {
    try {
        const { email, otp } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return next(new AppError('User not found', 404, 'USER_NOT_FOUND', { email: 'No user with this email' }));
        }
        if (user.isVerified) {
            return next(new AppError('Email already verified', 400, 'ALREADY_VERIFIED', { email: 'Email is already verified' }));
        }
        if (user.otp !== otp) {
            return next(new AppError('Invalid OTP', 400, 'INVALID_OTP', { otp: 'The OTP you entered is incorrect' }));
        }
        if (user.expiresAt < getNowIST()) {
            return next(new AppError('OTP has expired', 400, 'OTP_EXPIRED', { otp: 'The OTP you entered has expired' }));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, otp: null, expiresAt: null }
        });

        return new ApiResponse(res, 200, { user: { id: user.id, email: user.email, isVerified: true } }, 'Email verified successfully.');

    } catch (error) {
        return next(error);
    }
}

async function resendVerificationOtp(req, res, next) {
    try {
        const { email } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, isVerified: true, gym_id: true },
        });
        if (!user) {
            return new ApiResponse(res, 200, null, 'If an account exists, a new OTP has been sent.');
        }
        if (user.isVerified) {
            return next(new AppError('Email is already verified', 400, 'ALREADY_VERIFIED'));
        }

        const otp = generateOTP();
        const expiresInMinutes = parseInt(process.env.OTP_EXPIRATION, 10) || 10;
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { otp, expiresAt },
        });

        const gym = await prisma.gym.findUnique({
            where: { id: user.gym_id },
            select: { name: true },
        });

        try {
            await sendOtpEmail({
                to: user.email,
                name: user.email.split('@')[0],
                otp,
                expiresInMinutes,
                gymName: gym ? gym.name : 'your gym',
            });
        } catch (emailError) {
            console.error('Failed to resend verification OTP:', emailError);
            return next(new AppError('Could not send OTP email.', 502, 'EMAIL_SEND_FAILED'));
        }

        return new ApiResponse(res, 200, { email: user.email, expiresInMinutes }, 'A new OTP has been sent.');
    } catch (error) {
        console.error('Resend OTP error:', error);
        return next(error);
    }
}

async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true },
        });
        if (!user) {
            return new ApiResponse(res, 200, null, 'If an account exists, a reset code has been sent.');
        }

        const otp = generateOTP();
        const expiresInMinutes = parseInt(process.env.OTP_EXPIRATION, 10) || 10;
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { otp, expiresAt },
        });

        try {
            await sendPasswordResetEmail({
                to: user.email,
                name: user.email.split('@')[0],
                otp,
                expiresInMinutes,
            });
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            return next(new AppError('Could not send reset email.', 502, 'EMAIL_SEND_FAILED'));
        }

        return new ApiResponse(res, 200, { email: user.email, expiresInMinutes }, 'If an account exists, a reset code has been sent.');
    } catch (error) {
        console.error('Forgot password error:', error);
        return next(error);
    }
}

async function resetPassword(req, res, next) {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return next(new AppError('Invalid email or OTP', 400, 'INVALID_OTP'));
        }
        if (!user.otp || !user.expiresAt) {
            return next(new AppError('No reset request pending. Start the flow again.', 400, 'NO_OTP_PENDING'));
        }
        if (user.expiresAt < getNowIST()) {
            await prisma.user.update({
                where: { id: user.id },
                data: { otp: null, expiresAt: null },
            });
            return next(new AppError('Reset code has expired. Start the flow again.', 400, 'OTP_EXPIRED'));
        }
        if (user.otp !== otp) {
            return next(new AppError('Invalid OTP', 400, 'INVALID_OTP'));
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password_hash: passwordHash,
                otp: null,
                expiresAt: null,
                refreshToken: null,
                isVerified: true,
            },
        });

        return new ApiResponse(res, 200, null, 'Password reset successfully. Please log in with your new password.');
    } catch (error) {
        console.error('Reset password error:', error);
        return next(error);
    }
}

module.exports = {
    registerGym,
    verifyEmail,
    resendVerificationOtp,
    forgotPassword,
    resetPassword,
};