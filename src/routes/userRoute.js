const express = require('express');
const { registerGym, verifyEmail } = require('../controllers/userController');
const { validateRegistration } = require('../middlewares/validation');

const router = express.Router();

router.post('/register', validateRegistration, registerGym);
router.post('/verify-email', verifyEmail);

module.exports = router;
