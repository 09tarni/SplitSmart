const cron = require('node-cron');
const pool = require('../db');

const round2 = (value) => Math.round(Number(value) * 100) / 100;

const processRecurringExpenses = async () => {
  console.log('[CRON] Checking recurring expenses...');
  const client = await pool.connect();
  try {
    const due = await client.query(
      `SELECT r.*, u.name AS paid_by_name
       FROM recurring_expenses r
       JOIN users u ON r.paid_by = u.id
       WHERE r.is_active = TRUE AND r.next_due <= CURRENT_DATE`
    );
    if (due.rows.length === 0) {
      console.log('[CRON] No recurring expenses due today.');
      return;
    }
    console.log(`[CRON] Processing ${due.rows.length} recurring expense(s)...`);
    for (const rec of due.rows) {
      await client.query('BEGIN');
      try {
        const expResult = await client.query(
          `INSERT INTO expenses (group_id, paid_by, title, amount, split_type, category, date)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE) RETURNING *`,
          [rec.group_id, rec.paid_by, rec.title, rec.amount, rec.split_type, rec.category]
        );
        const expense = expResult.rows[0];
        const membersResult = await client.query(
          `SELECT user_id FROM group_members WHERE group_id = $1`, [rec.group_id]
        );
        const members = membersResult.rows;
        const count = members.length;
        if (count > 0) {
          const perPerson = round2(rec.amount / count);
          const splits = members.map((m, i) => ({
            user_id: m.user_id,
            owed_amount: i === count - 1 ? round2(rec.amount - perPerson * (count - 1)) : perPerson,
          }));
          await client.query(
            `INSERT INTO expense_splits (expense_id, user_id, owed_amount)
             SELECT $1, unnest($2::int[]), unnest($3::numeric[])`,
            [expense.id, splits.map(s => s.user_id), splits.map(s => s.owed_amount)]
          );
        }
        let interval;
        if (rec.frequency === 'daily')   interval = '1 day';
        if (rec.frequency === 'weekly')  interval = '7 days';
        if (rec.frequency === 'monthly') interval = '1 month';
        await client.query(
          `UPDATE recurring_expenses SET next_due = next_due + $1::interval WHERE id = $2`,
          [interval, rec.id]
        );
        await client.query('COMMIT');
        console.log(`[CRON] Created expense "${rec.title}" for group ${rec.group_id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[CRON] Failed for recurring id ${rec.id}:`, err.message);
      }
    }
  } finally {
    client.release();
  }
};

const startRecurringJob = () => {
  cron.schedule('0 0 * * *', processRecurringExpenses, { timezone: 'Asia/Kolkata' });
  console.log('[CRON] Recurring expense job scheduled (daily at midnight IST)');
  processRecurringExpenses();
};

module.exports = { startRecurringJob };