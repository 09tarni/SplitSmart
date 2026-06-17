const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('../passport');
const { register, login, refresh, logout, getUserByEmail } = require('../controllers/authController');
const { registerValidator, loginValidator } = require('../middleware/validators');
const { protect } = require('../middleware/authMiddleware');
const pool = require('../db');
const logger = require('../logger');

const router = express.Router();

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const signAccessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

// Email/password routes
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/user-by-email', protect, getUserByEmail);

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: 'http://localhost:3000/login?error=oauth_failed',
  }),
  async (req, res) => {
    try {
      const user = req.user;
      const accessToken = signAccessToken(user);
      const refreshToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, refreshToken, expiresAt]
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      });

      const userParam = encodeURIComponent(JSON.stringify({
        id: user.id, name: user.name, email: user.email,
      }));

      const redirectUrl = `http://localhost:3000/oauth-callback?token=${accessToken}&user=${userParam}`;
      console.log('Redirecting to:', redirectUrl.substring(0, 100) + '...');
      logger.info(`OAuth redirect for user ${user.email}`);

      res.redirect(redirectUrl);
    } catch (err) {
      logger.error('Google callback error', { error: err.message });
      res.redirect('http://localhost:3000/login?error=oauth_failed');
    }
  }
);

module.exports = router;