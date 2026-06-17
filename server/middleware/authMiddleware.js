const jwt = require('jsonwebtoken');
const pool = require('../db');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query(
        'SELECT id, name, email FROM users WHERE id = $1',
        [decoded.id]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      req.user = result.rows[0];
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  } catch (err) {
    console.error('protect middleware error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { protect };