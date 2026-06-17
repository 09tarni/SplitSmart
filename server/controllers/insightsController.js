const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const pool = require('../db');
const logger = require('../logger');

const getAIInsights = async (req, res) => {
  try {
    const { groupId } = req.params;

    const [
      groupResult,
      expensesResult,
      balancesResult,
      categoryResult,
      monthlyResult,
    ] = await Promise.all([
      pool.query(
        `SELECT name FROM groups WHERE id = $1`,
        [groupId]
      ),

      pool.query(
        `SELECT e.title, e.amount, e.category, u.name AS paid_by, e.date
         FROM expenses e
         JOIN users u ON u.id = e.paid_by
         WHERE e.group_id = $1
         ORDER BY e.created_at DESC
         LIMIT 50`,
        [groupId]
      ),

      pool.query(
        `SELECT
           u.name,
           COALESCE(paid.amount_paid, 0) AS amount_paid,
           COALESCE(owed.amount_owed, 0) AS amount_owed,
           COALESCE(paid.amount_paid, 0) - COALESCE(owed.amount_owed, 0) AS balance
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         LEFT JOIN (
           SELECT paid_by, SUM(amount) AS amount_paid
           FROM expenses
           WHERE group_id = $1
           GROUP BY paid_by
         ) paid ON paid.paid_by = u.id
         LEFT JOIN (
           SELECT
             es.user_id,
             SUM(es.owed_amount) AS amount_owed
           FROM expense_splits es
           JOIN expenses e ON e.id = es.expense_id
           WHERE e.group_id = $1
           GROUP BY es.user_id
         ) owed ON owed.user_id = u.id
         WHERE gm.group_id = $1`,
        [groupId]
      ),

      pool.query(
        `SELECT
           category,
           SUM(amount) AS total
         FROM expenses
         WHERE group_id = $1
         GROUP BY category
         ORDER BY total DESC`,
        [groupId]
      ),

      pool.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
           SUM(amount) AS total
         FROM expenses
         WHERE group_id = $1
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY DATE_TRUNC('month', created_at) ASC`,
        [groupId]
      ),
    ]);

    const groupName = groupResult.rows[0]?.name || 'this group';
    const expenses = expensesResult.rows;
    const balances = balancesResult.rows;
    const categories = categoryResult.rows;
    const monthly = monthlyResult.rows;

    if (expenses.length === 0) {
      return res.json({
        success: true,
        data: {
          insights: [
            'Add some expenses to generate AI-powered spending insights.',
          ],
        },
      });
    }

    const totalSpend = expenses.reduce(
      (sum, expense) => sum + parseFloat(expense.amount),
      0
    );

    const prompt = `
You are an expert financial analyst for a modern expense-splitting app.

Analyze the following group spending data and generate EXACTLY 4 insights.

Rules:
- Use actual member names and amounts.
- Be specific and data-driven.
- Avoid generic phrases like "indicating a need" or "suggesting a need".
- Focus on patterns users can act upon.
- Each insight should be 1-2 sentences.
- Mention who contributes most.
- Mention members with significant debt.
- Mention unusual spending categories.
- Include one realistic budgeting recommendation.
- Do not invent budgets or numbers not present in the data.
- Any recommendation must be based on existing spending patterns.

GROUP:
${groupName}

TOTAL SPENDING:
₹${totalSpend.toLocaleString('en-IN')}

MEMBER BALANCES:
${balances
  .map(
    (b) =>
      `${b.name}: paid ₹${Number(b.amount_paid).toLocaleString(
        'en-IN'
      )}, owes ₹${Number(b.amount_owed).toLocaleString(
        'en-IN'
      )}, balance ₹${Number(b.balance).toLocaleString('en-IN')}`
  )
  .join('\n')}

CATEGORY BREAKDOWN:
${categories
  .map(
    (c) =>
      `${c.category}: ₹${Number(c.total).toLocaleString('en-IN')}`
  )
  .join('\n')}

MONTHLY SPENDING:
${monthly
  .map(
    (m) =>
      `${m.month}: ₹${Number(m.total).toLocaleString('en-IN')}`
  )
  .join('\n')}

RECENT EXPENSES:
${expenses
  .slice(0, 10)
  .map(
    (e) =>
      `${e.title} - ₹${Number(e.amount).toLocaleString(
        'en-IN'
      )} (${e.category}) paid by ${e.paid_by}`
  )
  .join('\n')}

Return ONLY valid JSON in this format:

[
  "Insight 1",
  "Insight 2",
  "Insight 3",
  "Insight 4"
]
`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
    });

    const text = completion.choices[0].message.content.trim();

    let insights;

    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      insights = JSON.parse(cleaned);

      if (!Array.isArray(insights)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      logger.warn('AI response parsing failed');

      insights = [
        'Spending data was analyzed successfully.',
        'The AI response format was unexpected.',
        'Try refreshing to generate a new analysis.',
        'Your expense data remains available for review.',
      ];
    }

    logger.info(`AI insights generated for group ${groupId}`);

    return res.json({
      success: true,
      data: {
        insights,
      },
    });
  } catch (err) {
    logger.error('getAIInsights error', {
      error: err.message,
      stack: err.stack,
    });

    console.error('FULL ERROR:', err);

    return res.json({
      success: true,
      data: {
        insights: [
          'AI insights are temporarily unavailable.',
          'Please try again in a few minutes.',
          'Your expense data remains safe.',
          'Refresh to retry analysis.',
        ],
      },
    });
  }
};

module.exports = {
  getAIInsights,
};