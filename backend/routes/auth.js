const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

// Per email+IP (slows password guessing on one account) and per IP overall.
const loginKey = (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`;

router.post('/register', rateLimit({ ...LIMITS.register, key: (req) => `ip:${req.ip}` }), register);
router.post('/login', rateLimit({ ...LIMITS.loginIp, key: (req) => `ip:${req.ip}` }), rateLimit({ ...LIMITS.login, key: loginKey }), login);

module.exports = router;
