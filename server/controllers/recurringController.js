const pool = require('../db');
const logger = require('../logger');

const createRecurring = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, amount, split_type = 'equal', category = 'general', frequency, next_due } = req.body;
    const paid_by = req.user.id;
    if (!title || !amount || !frequency || !next_due) {
      return res.status(400).json({ success: false, message: 'title, amount, frequency, and next_due are required' });
    }
    const validFrequencies = ['daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ success: false, message: "frequency must be 'daily', 'weekly', or 'monthly'" });
    }
    const result = await pool.query(
      `INSERT INTO recurring_expenses (group_id, paid_by, title, amount, split_type, category, frequency, next_due)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [groupId, paid_by, title, parseFloat(amount), split_type, category, frequency, next_due]
    );
    logger.info(`Recurring expense created: "${title}" ${frequency} in group ${groupId}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('createRecurring error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getRecurring = async (req, res) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT r.*, u.name AS paid_by_name FROM recurring_expenses r
       JOIN users u ON r.paid_by = u.id
       WHERE r.group_id = $1 AND r.is_active = TRUE ORDER BY r.next_due ASC`,
      [groupId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('getRecurring error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteRecurring = async (req, res) => {
  try {
    const { recurringId } = req.params;
    await pool.query(`UPDATE recurring_expenses SET is_active = FALSE WHERE id = $1`, [recurringId]);
    logger.info(`Recurring expense ${recurringId} cancelled`);
    res.json({ success: true, message: 'Recurring expense cancelled' });
  } catch (err) {
    logger.error('deleteRecurring error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createRecurring, getRecurring, deleteRecurring };