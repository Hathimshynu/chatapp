const User = require('../models/User');

// @GET /api/users/search?query=name
const searchUsers = async (req, res) => {
  try {
    const keyword = req.query.query
      ? { name: { $regex: req.query.query, $options: 'i' } }
      : {};

    const users = await User.find({
      ...keyword,
      _id: { $ne: req.user._id }
    }).select('-password').limit(20);

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @GET /api/users/me
const getMe = async (req, res) => {
  res.json(req.user);
};

module.exports = { searchUsers, getMe };