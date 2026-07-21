const express = require('express');
const { loginUser, refreshAccessToken, logoutUser } = require('../controllers/authController');
const {
    resendVerificationOtp,
    forgotPassword,
    resetPassword,
} = require('../controllers/userController');
const { authenticate } = require('../middlewares/authorization');
const {
    validateEmailOnly,
    validateResetPassword,
} = require('../middlewares/validation');

const router = express.Router();

router.post('/login', loginUser);
router.post('/refresh', refreshAccessToken);
router.post('/logout', authenticate, logoutUser);

router.post('/resend-otp', validateEmailOnly, resendVerificationOtp);
router.post('/forgot-password', validateEmailOnly, forgotPassword);
router.post('/reset-password', validateResetPassword, resetPassword);

module.exports = router;
