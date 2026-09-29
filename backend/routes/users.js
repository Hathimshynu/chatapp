const express = require('express');
const router = express.Router();
const c = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { rateLimit, LIMITS } = require('../utils/rateLimit');

router.use(protect);

// Static paths before /:id
router.get('/me', c.getMe);
router.get('/search', rateLimit(LIMITS.search), c.searchUsers);
router.put('/profile', c.updateProfile);
router.get('/privacy', c.getPrivacy);
router.put('/privacy', c.updatePrivacy);
router.get('/blocked', c.listBlocked);
router.post('/:id/block', rateLimit(LIMITS.block), c.block);
router.delete('/:id/block', rateLimit(LIMITS.block), c.unblock);
router.get('/:id', c.getUser);

module.exports = router;
