const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Returns the user for a JWT, or null when the token is invalid/expired or the user no longer exists.
const userFromToken = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.id).select('-password').lean();
  } catch {
    return null;
  }
};

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  const user = await userFromToken(header.slice(7));
  if (!user) return res.status(401).json({ message: 'Not authorized, token failed' });
  req.user = user;
  return next();
};

module.exports = { protect, userFromToken };
