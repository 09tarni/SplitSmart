const pool = require('../db');
const logger = require('../logger');

const createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Group name is required' });
    const result = await pool.query(
      `INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [name, description || null, req.user.id]
    );
    const group = result.rows[0];
    await pool.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [group.id, req.user.id]);
    logger.info(`Group created: "${name}" by user ${req.user.id}`);
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    logger.error('createGroup error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getMyGroups = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, COUNT(gm.user_id) AS member_count
       FROM groups g
       INNER JOIN group_members gm ON gm.group_id = g.id
       WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = $1)
       GROUP BY g.id ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('getMyGroups error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getGroupById = async (req, res) => {
  try {
    const groupResult = await pool.query(`SELECT * FROM groups WHERE id = $1`, [req.params.id]);
    if (!groupResult.rows[0]) return res.status(404).json({ success: false, message: 'Group not found' });
    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u
       INNER JOIN group_members gm ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: { group: groupResult.rows[0], members: membersResult.rows } });
  } catch (err) {
    logger.error('getGroupById error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const addMember = async (req, res) => {
  try {
    const { user_id } = req.body;
    const groupId = req.params.id;
    const existing = await pool.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, user_id]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'User is already a member' });
    await pool.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [groupId, user_id]);
    const userResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [user_id]);
    const userName = userResult.rows[0]?.name || 'Someone';
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member_added', { groupId, message: `${userName} joined the group` });
    }
    logger.info(`Member ${user_id} added to group ${groupId}`);
    res.json({ success: true, message: 'Member added' });
  } catch (err) {
    logger.error('addMember error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateGroup = async (req, res) => {
  try {
    const { name } = req.body;
    const groupId = req.params.id;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Group name is required' });
    const group = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
    if (!group.rows[0]) return res.status(404).json({ success: false, message: 'Group not found' });
    if (group.rows[0].created_by !== req.user.id)
      return res.status(403).json({ success: false, message: 'Only the group creator can edit the group name' });
    const result = await pool.query(`UPDATE groups SET name = $1 WHERE id = $2 RETURNING *`, [name.trim(), groupId]);
    logger.info(`Group ${groupId} renamed to "${name}" by user ${req.user.id}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('updateGroup error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Check if user is a member
    const memberCheck = await pool.query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]
    );
    if (!memberCheck.rows.length) return res.status(400).json({ success: false, message: 'You are not a member of this group' });

    // Block creator from leaving
    const group = await pool.query(`SELECT created_by FROM groups WHERE id = $1`, [groupId]);
    if (group.rows[0]?.created_by === userId)
      return res.status(400).json({ success: false, message: 'Group creator cannot leave. Transfer ownership or delete the group.' });

    // Check balance — must be zero
    const balanceResult = await pool.query(
      `SELECT
         COALESCE(paid.amount_paid, 0) - COALESCE(owed.amount_owed, 0)
         + COALESCE(settled_out.amount_out, 0) - COALESCE(settled_in.amount_in, 0) AS balance
       FROM (SELECT 1) dummy
       LEFT JOIN (SELECT SUM(amount) AS amount_paid FROM expenses WHERE group_id = $1 AND paid_by = $2) paid ON true
       LEFT JOIN (SELECT SUM(es.owed_amount) AS amount_owed FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = $1 AND es.user_id = $2) owed ON true
       LEFT JOIN (SELECT SUM(amount) AS amount_out FROM settlements WHERE group_id = $1 AND payer = $2 AND status = 'completed') settled_out ON true
       LEFT JOIN (SELECT SUM(amount) AS amount_in FROM settlements WHERE group_id = $1 AND receiver = $2 AND status = 'completed') settled_in ON true`,
      [groupId, userId]
    );

    const balance = parseFloat(balanceResult.rows[0]?.balance || 0);
    if (Math.abs(balance) > 0.01) {
      const msg = balance > 0
        ? `You are owed ₹${balance.toFixed(2)}. Settle up before leaving.`
        : `You owe ₹${Math.abs(balance).toFixed(2)}. Settle up before leaving.`;
      return res.status(400).json({ success: false, message: msg });
    }

    await pool.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
    logger.info(`User ${userId} left group ${groupId}`);
    res.json({ success: true, message: 'You have left the group' });
  } catch (err) {
    logger.error('leaveGroup error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
    if (!group.rows[0]) return res.status(404).json({ success: false, message: 'Group not found' });
    if (group.rows[0].created_by !== req.user.id)
      return res.status(403).json({ success: false, message: 'Only the group creator can delete the group' });

    // Check all balances are settled
    const balanceResult = await pool.query(
      `SELECT u.name,
         COALESCE(paid.amount_paid, 0) - COALESCE(owed.amount_owed, 0)
         + COALESCE(so.amount_out, 0) - COALESCE(si.amount_in, 0) AS balance
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN (SELECT paid_by, SUM(amount) AS amount_paid FROM expenses WHERE group_id = $1 GROUP BY paid_by) paid ON paid.paid_by = u.id
       LEFT JOIN (SELECT es.user_id, SUM(es.owed_amount) AS amount_owed FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = $1 GROUP BY es.user_id) owed ON owed.user_id = u.id
       LEFT JOIN (SELECT payer, SUM(amount) AS amount_out FROM settlements WHERE group_id = $1 AND status = 'completed' GROUP BY payer) so ON so.payer = u.id
       LEFT JOIN (SELECT receiver, SUM(amount) AS amount_in FROM settlements WHERE group_id = $1 AND status = 'completed' GROUP BY receiver) si ON si.receiver = u.id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    const unsettled = balanceResult.rows.filter(r => Math.abs(parseFloat(r.balance)) > 0.01);
    if (unsettled.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete group — ${unsettled.map(u => u.name).join(', ')} still have unsettled balances.`,
      });
    }

    // Delete in order (foreign key constraints)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM recurring_expenses WHERE group_id = $1`, [groupId]);
      await client.query(`DELETE FROM settlements WHERE group_id = $1`, [groupId]);
      const expenseIds = await client.query(`SELECT id FROM expenses WHERE group_id = $1`, [groupId]);
      if (expenseIds.rows.length > 0) {
        const ids = expenseIds.rows.map(r => r.id);
        await client.query(`DELETE FROM expense_splits WHERE expense_id = ANY($1::int[])`, [ids]);
        await client.query(`DELETE FROM expenses WHERE group_id = $1`, [groupId]);
      }
      await client.query(`DELETE FROM group_members WHERE group_id = $1`, [groupId]);
      await client.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info(`Group ${groupId} deleted by user ${req.user.id}`);
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    logger.error('deleteGroup error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createGroup, getMyGroups, getGroupById, addMember, updateGroup, leaveGroup, deleteGroup };