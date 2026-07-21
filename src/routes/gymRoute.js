const express = require('express');
const {
    getMyGymProfile,
    updateMyGymProfile,
    uploadGymLogo,
    uploadGymCover,
    removeGymLogo,
    removeGymCover,
    updateMyPassword,
} = require('../controllers/gymController');
const { authenticate, authorize } = require('../middlewares/authorization');
const {
    validateGymProfileUpdate,
    validatePasswordUpdate,
} = require('../middlewares/validation');
const { gymLogoUpload, gymCoverUpload } = require('../middlewares/upload');

const router = express.Router();

router.get('/profile', authenticate, getMyGymProfile);
router.patch('/profile', authenticate, authorize('OWNER'), validateGymProfileUpdate, updateMyGymProfile);

router.post(
    '/profile/logo',
    authenticate,
    authorize('OWNER'),
    gymLogoUpload.single('logo'),
    uploadGymLogo
);
router.delete('/profile/logo', authenticate, authorize('OWNER'), removeGymLogo);

router.post(
    '/profile/cover',
    authenticate,
    authorize('OWNER'),
    gymCoverUpload.single('coverImage'),
    uploadGymCover
);
router.delete('/profile/cover', authenticate, authorize('OWNER'), removeGymCover);

router.post('/me/password', authenticate, validatePasswordUpdate, updateMyPassword);

module.exports = router;
