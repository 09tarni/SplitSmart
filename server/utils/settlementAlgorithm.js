/**
 * Debt Simplification Algorithm
 * Input: array of { user_id, name, balance }
 * Output: array of { from, from_name, to, to_name, amount }
 * Minimizes the number of transactions needed to settle all debts
 */

function simplifyDebts(balances) {
  // Separate into creditors (balance > 0) and debtors (balance < 0)
  let creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({
      user_id: b.user_id,
      name: b.name,
      amount: parseFloat(b.balance),
    }));

  let debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({
      user_id: b.user_id,
      name: b.name,
      amount: parseFloat(Math.abs(b.balance)),
    }));

  const transactions = [];

  while (creditors.length > 0 && debtors.length > 0) {
    // Sort descending so largest amounts are first
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const creditor = creditors[0];
    const debtor = debtors[0];

    // Settle as much as possible in one transaction
    const amount = Math.min(creditor.amount, debtor.amount);

    transactions.push({
      from: debtor.user_id,
      from_name: debtor.name,
      to: creditor.user_id,
      to_name: creditor.name,
      amount: parseFloat(amount.toFixed(2)),
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    // Remove settled parties
    if (creditor.amount < 0.01) creditors.shift();
    if (debtor.amount < 0.01) debtors.shift();
  }

  return transactions;
}

module.exports = { simplifyDebts };
