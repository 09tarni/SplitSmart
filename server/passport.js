const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');
const logger = require('./logger');

// Helper function to process pending invites
const processPendingInvites = async (userId, email) => {
  try {
    const invitesResult = await pool.query(
      `SELECT id, group_id FROM pending_invites 
       WHERE LOWER(email) = LOWER($1) AND status = 'pending'`,
      [email]
    );
    
    if (invitesResult.rows.length === 0) return;
    
    for (const invite of invitesResult.rows) {
      const existing = await pool.query(
        `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [invite.group_id, userId]
      );
      
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
          [invite.group_id, userId]
        );
      }
      
      await pool.query(
        `UPDATE pending_invites SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [invite.id]
      );
      
      logger.info(`User ${userId} added to group ${invite.group_id} via pending invite`);
    }
  } catch (err) {
    logger.error('Error processing pending invites', { error: err.message });
  }
};

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const name = profile.displayName;
    const googleId = profile.id;

    // Check if user exists by email
    const existing = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      // Update google_id if not set
      if (!user.google_id) {
        await pool.query(
          'UPDATE users SET google_id = $1 WHERE id = $2',
          [googleId, user.id]
        );
      }
      logger.info(`Google OAuth login: ${email}`);
      return done(null, user);
    }

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (name, email, google_id, password)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, email, googleId, null]
    );
    
    const newUser = result.rows[0];
    
    // Process any pending invites for this email
    await processPendingInvites(newUser.id, email);
    
    logger.info(`Google OAuth new user: ${email}`);
    return done(null, newUser);
  } catch (err) {
    logger.error('Google OAuth error', { error: err.message });
    return done(err, null);
  }
}));

module.exports = passport;