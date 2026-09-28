const express = require('express');
const router = express.Router();
const { searchUsers, getMe, getUser, updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/me', getMe);
router.get('/search', searchUsers);
router.put('/profile', updateProfile);
router.get('/:id', getUser);

module.exports = router;
