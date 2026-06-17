const pool = require('../db');
const logger = require('../logger');

const getGroupActivity = async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const result = await pool.query(
      `SELECT * FROM (
        -- Expenses
        SELECT
          'expense' AS type,
          e.id,
          e.title AS description,
          e.amount,
          u.name AS actor,
          e.created_at
        FROM expenses e
        JOIN users u ON u.id = e.paid_by
        WHERE e.group_id = $1

        UNION ALL

        -- Settlements
        SELECT
          'settlement' AS type,
          s.id,
          CONCAT(p.name, ' paid ', r.name) AS description,
          s.amount,
          p.name AS actor,
          s.created_at
        FROM settlements s
        JOIN users p ON p.id = s.payer
        JOIN users r ON r.id = s.receiver
        WHERE s.group_id = $1

        UNION ALL

        -- Members joining
        SELECT
          'member' AS type,
          gm.id,
          CONCAT(u.name, ' joined the group') AS description,
          NULL AS amount,
          u.name AS actor,
          gm.joined_at AS created_at
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1

      ) AS activity
      ORDER BY created_at DESC
      LIMIT $2`,
      [groupId, limit]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('getGroupActivity error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getGroupActivity };