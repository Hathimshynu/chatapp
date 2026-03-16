const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { searchUsers, getMe } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/me', protect, getMe);
router.get('/search', protect, searchUsers);
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, status, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, status, avatar },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;