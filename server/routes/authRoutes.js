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
router.get('/google', (req, res, next) => {
  const inviteToken = req.query.invite || req.query.state || undefined;
  const auth = passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: inviteToken,
  });
  return auth(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      if (!req.user) {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        return res.redirect(`${clientUrl}/login?error=oauth_failed`);
      }

      const user = req.user;
      const inviteToken = req.query.state || req.query.invite;
      
      // If user is new and has an invite token, process it
      if (inviteToken) {
        try {
          const inviteResult = await pool.query(
            `SELECT id, group_id FROM pending_invites 
             WHERE invite_token = $1 AND LOWER(email) = LOWER($2) AND status = 'pending'`,
            [inviteToken, user.email]
          );
          
          if (inviteResult.rows.length > 0) {
            const invite = inviteResult.rows[0];
            
            // Add user to the group
            await pool.query(
              `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [invite.group_id, user.id]
            );
            
            // Mark invite as accepted
            await pool.query(
              `UPDATE pending_invites SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [invite.id]
            );
            
            logger.info(`User ${user.id} added to group ${invite.group_id} via OAuth invite token`);
          }
        } catch (inviteErr) {
          logger.error('Error processing OAuth invite token', { error: inviteErr.message });
          // Don't fail login if invite processing fails
        }
      }
      
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

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const redirectUrl = `${clientUrl}/oauth-callback?token=${accessToken}&user=${userParam}`;
      console.log('Redirecting to:', redirectUrl.substring(0, 100) + '...');
      logger.info(`OAuth redirect for user ${user.email}`);

      res.redirect(redirectUrl);
    } catch (err) {
      logger.error('Google callback error', { error: err.message });
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      res.redirect(`${clientUrl}/login?error=oauth_failed`);
    }
  },
  // Error handler for failed authentication
  (err, req, res, next) => {
    logger.error('Passport authentication error', { error: err.message });
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientUrl}/login?error=oauth_failed`);
  }
);

module.exports = router;