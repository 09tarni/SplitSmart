const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const logger = require('../logger');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const signAccessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');
const omitPassword = ({ password, ...user }) => user;

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  });
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at`,
      [name, email, hashedPassword]
    );
    const user = result.rows[0];
    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );
    setRefreshCookie(res, refreshToken);
    logger.info(`New user registered: ${email}`);
    res.status(201).json({ user, token: accessToken });
  } catch (err) {
    logger.error('register error', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT id, name, email, password, created_at FROM users WHERE email = $1', [email]
    );
    const user = result.rows[0];
    if (!user) {
      logger.warn(`Failed login attempt for email: ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn(`Failed login attempt for email: ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );
    setRefreshCookie(res, refreshToken);
    logger.info(`User logged in: ${email}`);
    res.json({ user: omitPassword(user), token: accessToken });
  } catch (err) {
    logger.error('login error', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: 'No refresh token' });
    const result = await pool.query(
      `SELECT rt.*, u.id as uid, u.name, u.email FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    const row = result.rows[0];
    const user = { id: row.uid, email: row.email, name: row.name };
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE id = $3`,
      [newRefreshToken, expiresAt, row.id]
    );
    const accessToken = signAccessToken(user);
    setRefreshCookie(res, newRefreshToken);
    logger.debug(`Token refreshed for user: ${user.email}`);
    res.json({ token: accessToken });
  } catch (err) {
    logger.error('refresh error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    logger.error('logout error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('getUserByEmail error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { register, login, refresh, logout, getUserByEmail };