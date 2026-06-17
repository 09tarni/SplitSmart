const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');
const logger = require('./logger');

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
    logger.info(`Google OAuth new user: ${email}`);
    return done(null, result.rows[0]);
  } catch (err) {
    logger.error('Google OAuth error', { error: err.message });
    return done(err, null);
  }
}));

module.exports = passport;