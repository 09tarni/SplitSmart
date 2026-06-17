const PDFDocument = require('pdfkit');
const pool = require('../db');
const logger = require('../logger');

const generateReport = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { format = 'pdf', month } = req.query;

    // Fetch group info
    const groupResult = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    const group = groupResult.rows[0];

    // Build date filter
    let dateFilter = '';
    let dateParams = [groupId];
    if (month) {
      dateFilter = `AND DATE_TRUNC('month', e.date) = DATE_TRUNC('month', $2::date)`;
      dateParams.push(month);
    }

    // Fetch expenses
    const expensesResult = await pool.query(
      `SELECT e.*, u.name AS paid_by_name
       FROM expenses e
       JOIN users u ON u.id = e.paid_by
       WHERE e.group_id = $1 ${dateFilter}
       ORDER BY e.date DESC, e.created_at DESC`,
      dateParams
    );
    const expenses = expensesResult.rows;

    // Fetch balances
    const balancesResult = await pool.query(
      `SELECT
         u.id AS user_id, u.name,
         COALESCE(paid.amount_paid, 0) AS amount_paid,
         COALESCE(owed.amount_owed, 0) AS amount_owed,
         COALESCE(paid.amount_paid, 0) - COALESCE(owed.amount_owed, 0) AS balance
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN (SELECT paid_by, SUM(amount) AS amount_paid FROM expenses WHERE group_id = $1 GROUP BY paid_by) paid ON paid.paid_by = u.id
       LEFT JOIN (SELECT es.user_id, SUM(es.owed_amount) AS amount_owed FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = $1 GROUP BY es.user_id) owed ON owed.user_id = u.id
       WHERE gm.group_id = $1 ORDER BY u.name`,
      [groupId]
    );
    const balances = balancesResult.rows;

    const totalSpend = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const reportTitle = month
      ? `Expense Report — ${new Date(month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
      : 'Full Expense Report';

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const lines = [
        `Group: ${group.name}`,
        `Report: ${reportTitle}`,
        `Generated: ${new Date().toLocaleDateString('en-IN')}`,
        `Total Spend: Rs.${totalSpend.toFixed(2)}`,
        '',
        'Date,Title,Category,Paid By,Amount,Split Type',
        ...expenses.map(e =>
          `${new Date(e.date || e.created_at).toLocaleDateString('en-IN')},"${e.title}",${e.category},${e.paid_by_name},${parseFloat(e.amount).toFixed(2)},${e.split_type}`
        ),
        '',
        'Member Balances',
        'Name,Paid,Owed,Net Balance',
        ...balances.map(b =>
          `${b.name},${parseFloat(b.amount_paid).toFixed(2)},${parseFloat(b.amount_owed).toFixed(2)},${parseFloat(b.balance).toFixed(2)}`
        ),
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${group.name}-report.csv"`);
      return res.send(lines.join('\n'));
    }

    // ── PDF ──────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${group.name}-report.pdf"`);
    doc.pipe(res);

    const PRIMARY = '#7c3aed';
    const DARK = '#1f2937';
    const MUTED = '#6b7280';
    const LIGHT_BG = '#f9fafb';
    const PAGE_WIDTH = doc.page.width - 100;

    // Header bar
    doc.rect(0, 0, doc.page.width, 80).fill(PRIMARY);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('SplitSmart', 50, 20);
    doc.fontSize(11).font('Helvetica')
      .text('Expense Report', 50, 48);
    doc.fillColor(DARK);

    // Group name + meta
    doc.moveDown(3);
    doc.fontSize(18).font('Helvetica-Bold').fillColor(DARK)
      .text(group.name, 50);
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text(`${reportTitle}  ·  Generated ${new Date().toLocaleDateString('en-IN')}`, 50);

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + PAGE_WIDTH, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Summary cards
    const cardY = doc.y;
    const cardW = (PAGE_WIDTH - 20) / 3;

    const drawCard = (x, y, label, value, color = DARK) => {
      doc.rect(x, y, cardW, 54).fill(LIGHT_BG).stroke('#e5e7eb');
      doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(label, x + 10, y + 10, { width: cardW - 20 });
      doc.fillColor(color).fontSize(16).font('Helvetica-Bold').text(value, x + 10, y + 26, { width: cardW - 20 });
    };

    drawCard(50, cardY, 'Total Spend', `Rs.${totalSpend.toFixed(2)}`, PRIMARY);
    drawCard(50 + cardW + 10, cardY, 'Expenses', `${expenses.length}`, DARK);
    drawCard(50 + (cardW + 10) * 2, cardY, 'Members', `${balances.length}`, DARK);

    doc.y = cardY + 70;
    doc.fillColor(DARK);

    // Member Balances section
    doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text('Member Balances', 50);
    doc.moveDown(0.4);

    const bHeaderY = doc.y;
    doc.rect(50, bHeaderY, PAGE_WIDTH, 22).fill(PRIMARY);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('Member', 60, bHeaderY + 6, { width: 150 });
    doc.text('Paid', 210, bHeaderY + 6, { width: 100, align: 'right' });
    doc.text('Owes', 310, bHeaderY + 6, { width: 100, align: 'right' });
    doc.text('Net Balance', 410, bHeaderY + 6, { width: 130, align: 'right' });

    let rowY = bHeaderY + 22;
    balances.forEach((b, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : LIGHT_BG;
      doc.rect(50, rowY, PAGE_WIDTH, 20).fill(bg);
      const bal = parseFloat(b.balance);
      const balColor = bal > 0 ? '#16a34a' : bal < 0 ? '#dc2626' : MUTED;
      const balText = bal > 0 ? `+Rs.${bal.toFixed(2)}` : bal < 0 ? `-Rs.${Math.abs(bal).toFixed(2)}` : 'Settled';

      doc.fillColor(DARK).fontSize(9).font('Helvetica').text(b.name, 60, rowY + 5, { width: 150 });
      doc.text(`Rs.${parseFloat(b.amount_paid).toFixed(2)}`, 210, rowY + 5, { width: 100, align: 'right' });
      doc.text(`Rs.${parseFloat(b.amount_owed).toFixed(2)}`, 310, rowY + 5, { width: 100, align: 'right' });
      doc.fillColor(balColor).text(balText, 410, rowY + 5, { width: 130, align: 'right' });
      rowY += 20;
    });

    doc.y = rowY + 20;
    doc.fillColor(DARK);

    // Expenses section
    doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text('Expenses', 50);
    doc.moveDown(0.4);

    if (expenses.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor(MUTED).text('No expenses found for this period.', 50);
    } else {
      const eHeaderY = doc.y;
      doc.rect(50, eHeaderY, PAGE_WIDTH, 22).fill(PRIMARY);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('Date', 60, eHeaderY + 6, { width: 70 });
      doc.text('Title', 130, eHeaderY + 6, { width: 160 });
      doc.text('Category', 290, eHeaderY + 6, { width: 80 });
      doc.text('Paid By', 370, eHeaderY + 6, { width: 90 });
      doc.text('Amount', 460, eHeaderY + 6, { width: 80, align: 'right' });

      let eRowY = eHeaderY + 22;
      expenses.forEach((e, i) => {
        // New page if needed
        if (eRowY > doc.page.height - 80) {
          doc.addPage();
          eRowY = 50;
        }
        const bg = i % 2 === 0 ? '#ffffff' : LIGHT_BG;
        doc.rect(50, eRowY, PAGE_WIDTH, 20).fill(bg);
        doc.fillColor(DARK).fontSize(8.5).font('Helvetica');
        const dateStr = new Date(e.date || e.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
        doc.text(dateStr, 60, eRowY + 5, { width: 70 });
        doc.text(e.title, 130, eRowY + 5, { width: 155, ellipsis: true });
        doc.fillColor(MUTED).text(e.category, 290, eRowY + 5, { width: 80 });
        doc.fillColor(DARK).text(e.paid_by_name, 370, eRowY + 5, { width: 90 });
        doc.fillColor(PRIMARY).font('Helvetica-Bold')
          .text(`Rs.${parseFloat(e.amount).toFixed(2)}`, 460, eRowY + 5, { width: 80, align: 'right' });
        eRowY += 20;
      });
    }

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text(`Generated by SplitSmart · ${new Date().toLocaleString('en-IN')}`,
        50, doc.page.height - 40, { align: 'center', width: PAGE_WIDTH });

    doc.end();
    logger.info(`Report generated for group ${groupId} format=${format}`);
  } catch (err) {
    logger.error('generateReport error', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { generateReport };