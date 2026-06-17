const pool = require('../db');
const { simplifyDebts } = require('../utils/settlementAlgorithm');
const logger = require('../logger');

const VALID_SPLIT_TYPES = ['equal', 'percentage', 'exact'];
const round2 = (value) => Math.round(Number(value) * 100) / 100;

const buildEqualSplits = (amount, members) => {
  const count = members.length;
  if (count === 0) return [];
  const perPerson = round2(amount / count);
  const result = [];
  let assigned = 0;
  for (let i = 0; i < count; i++) {
    const owedAmount = i === count - 1 ? round2(amount - assigned) : perPerson;
    result.push({ user_id: members[i].user_id, owed_amount: owedAmount });
    assigned = round2(assigned + owedAmount);
  }
  return result;
};

const insertExpenseSplits = async (client, expenseId, splitRows) => {
  const userIds = splitRows.map((s) => s.user_id);
  const owedAmounts = splitRows.map((s) => s.owed_amount);
  await client.query(
    `INSERT INTO expense_splits (expense_id, user_id, owed_amount)
     SELECT $1, unnest($2::int[]), unnest($3::numeric[])`,
    [expenseId, userIds, owedAmounts]
  );
};

const addExpense = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { title, amount, split_type: splitType, category, date, splits, paid_by } = req.body;
    const paidBy = paid_by ? parseInt(paid_by) : req.user.id;

    if (!title || amount == null || !splitType)
      return res.status(400).json({ success: false, message: 'title, amount, and split_type are required' });
    if (!VALID_SPLIT_TYPES.includes(splitType))
      return res.status(400).json({ success: false, message: "split_type must be 'equal', 'percentage', or 'exact'" });

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    if (splitType !== 'equal') {
      if (!Array.isArray(splits) || splits.length === 0)
        return res.status(400).json({ success: false, message: 'splits array is required for percentage and exact split types' });
      for (const split of splits) {
        if (split.user_id == null || split.owed_amount == null)
          return res.status(400).json({ success: false, message: 'Each split must include user_id and owed_amount' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let splitRows = [];
      if (splitType === 'equal') {
        const membersResult = await client.query(`SELECT user_id FROM group_members WHERE group_id = $1`, [groupId]);
        if (membersResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Group has no members' });
        }
        splitRows = buildEqualSplits(numericAmount, membersResult.rows);
      } else {
        splitRows = splits.map((s) => ({ user_id: s.user_id, owed_amount: round2(s.owed_amount) }));
      }
      const expenseResult = await client.query(
        `INSERT INTO expenses (group_id, paid_by, title, amount, split_type, category, date)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE)) RETURNING *`,
        [groupId, paidBy, title, numericAmount, splitType, category ?? 'general', date ?? null]
      );
      const expense = expenseResult.rows[0];
      await insertExpenseSplits(client, expense.id, splitRows);
      const userResult = await client.query(`SELECT name FROM users WHERE id = $1`, [paidBy]);
      const payerName = userResult.rows[0]?.name || 'Someone';
      await client.query('COMMIT');
      const io = req.app.get('io');
      if (io) {
        io.to(`group:${groupId}`).emit('expense_added', {
          groupId,
          message: `${payerName} added "${title}" — ₹${numericAmount}`,
          expense: { ...expense, paid_by_name: payerName },
        });
      }
      logger.info(`Expense added: "${title}" ₹${numericAmount} in group ${groupId}`);
      res.status(201).json({ success: true, data: expense });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('addExpense error', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getGroupExpenses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.name AS paid_by_name FROM expenses e
       INNER JOIN users u ON u.id = e.paid_by
       WHERE e.group_id = $1 ORDER BY e.created_at DESC`,
      [req.params.groupId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('getGroupExpenses error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const fetchGroupBalances = async (groupId) => {
  const result = await pool.query(
    `SELECT
       u.id AS user_id, u.name,
       COALESCE(paid.amount_paid, 0) AS amount_paid,
       COALESCE(owed.amount_owed, 0) AS amount_owed,
       COALESCE(settled_out.amount_settled_out, 0) AS amount_settled_out,
       COALESCE(settled_in.amount_settled_in, 0) AS amount_settled_in,
       (
         COALESCE(paid.amount_paid, 0)
         - COALESCE(owed.amount_owed, 0)
         + COALESCE(settled_out.amount_settled_out, 0)
         - COALESCE(settled_in.amount_settled_in, 0)
       ) AS balance
     FROM group_members gm
     INNER JOIN users u ON u.id = gm.user_id
     LEFT JOIN (SELECT paid_by, SUM(amount) AS amount_paid FROM expenses WHERE group_id = $1 GROUP BY paid_by) paid ON paid.paid_by = u.id
     LEFT JOIN (SELECT es.user_id, SUM(es.owed_amount) AS amount_owed FROM expense_splits es INNER JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = $1 GROUP BY es.user_id) owed ON owed.user_id = u.id
     LEFT JOIN (SELECT payer, SUM(amount) AS amount_settled_out FROM settlements WHERE group_id = $1 AND status = 'completed' GROUP BY payer) settled_out ON settled_out.payer = u.id
     LEFT JOIN (SELECT receiver, SUM(amount) AS amount_settled_in FROM settlements WHERE group_id = $1 AND status = 'completed' GROUP BY receiver) settled_in ON settled_in.receiver = u.id
     WHERE gm.group_id = $1 ORDER BY u.name ASC`,
    [groupId]
  );
  return result.rows;
};

const getGroupBalances = async (req, res) => {
  try {
    const balances = await fetchGroupBalances(req.params.groupId);
    res.json({ success: true, data: balances });
  } catch (err) {
    logger.error('getGroupBalances error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSimplifiedDebts = async (req, res) => {
  try {
    const balances = await fetchGroupBalances(req.params.groupId);
    const transactions = simplifyDebts(balances);
    res.json({ success: true, data: transactions });
  } catch (err) {
    logger.error('getSimplifiedDebts error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const settleUp = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { from_user_id, to_user_id, amount } = req.body;
    if (!from_user_id || !to_user_id || amount == null)
      return res.status(400).json({ success: false, message: 'from_user_id, to_user_id, and amount are required' });
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    await pool.query(
      `INSERT INTO settlements (group_id, payer, receiver, amount, status) VALUES ($1, $2, $3, $4, 'completed')`,
      [groupId, from_user_id, to_user_id, numericAmount]
    );
    const namesResult = await pool.query(`SELECT id, name FROM users WHERE id = ANY($1::int[])`, [[from_user_id, to_user_id]]);
    const names = Object.fromEntries(namesResult.rows.map(r => [r.id, r.name]));
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('settlement_made', {
        groupId,
        message: `${names[from_user_id]} paid ₹${numericAmount} to ${names[to_user_id]}`,
      });
    }
    logger.info(`Settlement: ${names[from_user_id]} paid ₹${numericAmount} to ${names[to_user_id]} in group ${groupId}`);
    res.json({ success: true, message: 'Settlement recorded' });
  } catch (err) {
    logger.error('settleUp error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSettlements = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name AS payer_name, r.name AS receiver_name
       FROM settlements s
       JOIN users p ON p.id = s.payer
       JOIN users r ON r.id = s.receiver
       WHERE s.group_id = $1 ORDER BY s.created_at DESC`,
      [req.params.groupId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('getSettlements error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getGroupAnalytics = async (req, res) => {
  try {
    const { groupId } = req.params;

    const [categoryResult, monthlyResult, topSpenderResult] = await Promise.all([
      pool.query(
        `SELECT category, CAST(SUM(amount) AS FLOAT) AS total
         FROM expenses WHERE group_id = $1 GROUP BY category ORDER BY total DESC`,
        [groupId]
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS month,
                DATE_TRUNC('month', created_at) AS month_date,
                CAST(SUM(amount) AS FLOAT) AS total
         FROM expenses WHERE group_id = $1
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY month_date ASC`,
        [groupId]
      ),
      pool.query(
        `SELECT u.name, CAST(SUM(e.amount) AS FLOAT) AS total_paid
         FROM expenses e JOIN users u ON e.paid_by = u.id
         WHERE e.group_id = $1 GROUP BY u.name ORDER BY total_paid DESC LIMIT 1`,
        [groupId]
      ),
    ]);

    // Build last 6 months scaffold so bar chart always shows 6 bars
    const last6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      last6.push({
        month: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        total: 0,
      });
    }

    // Merge DB results into scaffold
    const dbMonths = monthlyResult.rows;
    const byMonth = last6.map(slot => {
      const match = dbMonths.find(r => r.month === slot.month);
      return match ? { month: slot.month, total: match.total } : slot;
    });

    res.json({
      success: true,
      data: {
        byCategory: categoryResult.rows,
        byMonth,
        topSpender: topSpenderResult.rows[0] || null,
      },
    });
  } catch (err) {
    logger.error('getGroupAnalytics error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { addExpense, getGroupExpenses, getGroupBalances, getSimplifiedDebts, settleUp, getSettlements, getGroupAnalytics };