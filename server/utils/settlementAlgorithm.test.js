const { simplifyDebts } = require('./settlementAlgorithm');

// Helper to create a balance object
const balance = (user_id, name, bal) => ({ user_id, name, balance: bal });

describe('simplifyDebts', () => {

  test('returns empty array when everyone is settled up', () => {
    const balances = [
      balance(1, 'Alice', 0),
      balance(2, 'Bob', 0),
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  test('simple two-person debt', () => {
    const balances = [
      balance(1, 'Alice', 100),   // Alice is owed ₹100
      balance(2, 'Bob', -100),    // Bob owes ₹100
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      from: 2,
      from_name: 'Bob',
      to: 1,
      to_name: 'Alice',
      amount: 100,
    });
  });

  test('minimises transactions for three people', () => {
    // Alice paid for everyone — Bob owes 50, Charlie owes 50
    const balances = [
      balance(1, 'Alice', 100),
      balance(2, 'Bob', -50),
      balance(3, 'Charlie', -50),
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(100);
  });

  test('complex four-person scenario uses fewer transactions than naive', () => {
    // Without simplification this would be 3+ transactions
    const balances = [
      balance(1, 'Alice', 30),
      balance(2, 'Bob', 20),
      balance(3, 'Charlie', -10),
      balance(4, 'Dave', -40),
    ];
    const result = simplifyDebts(balances);
    // All debts should be cleared
    const netFlow = {};
    result.forEach(t => {
      netFlow[t.from] = (netFlow[t.from] || 0) - t.amount;
      netFlow[t.to]   = (netFlow[t.to]   || 0) + t.amount;
    });
    expect(Math.round(netFlow[1])).toBe(30);   // Alice gets back 30
    expect(Math.round(netFlow[2])).toBe(20);   // Bob gets back 20
    expect(Math.round(netFlow[3])).toBe(-10);  // Charlie pays 10
    expect(Math.round(netFlow[4])).toBe(-40);  // Dave pays 40
  });

  test('amounts are rounded to 2 decimal places', () => {
    const balances = [
      balance(1, 'Alice', 100 / 3),   // 33.333...
      balance(2, 'Bob', -(100 / 3)),
    ];
    const result = simplifyDebts(balances);
    expect(result[0].amount).toBe(Math.round((100 / 3) * 100) / 100);
  });

  test('handles single creditor and multiple debtors', () => {
    const balances = [
      balance(1, 'Alice', 90),
      balance(2, 'Bob', -30),
      balance(3, 'Charlie', -30),
      balance(4, 'Dave', -30),
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(3);
    result.forEach(t => {
      expect(t.to).toBe(1);      // everyone pays Alice
      expect(t.amount).toBe(30);
    });
  });

  test('handles multiple creditors and single debtor', () => {
    const balances = [
      balance(1, 'Alice', 50),
      balance(2, 'Bob', 50),
      balance(3, 'Charlie', -100),
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(100);
    result.forEach(t => expect(t.from).toBe(3)); // Charlie pays everyone
  });

  test('ignores zero balances', () => {
    const balances = [
      balance(1, 'Alice', 0),
      balance(2, 'Bob', 50),
      balance(3, 'Charlie', -50),
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe(3);
    expect(result[0].to).toBe(2);
  });

  test('net flow is zero — no money created or destroyed', () => {
    const balances = [
      balance(1, 'Alice', 120),
      balance(2, 'Bob', -80),
      balance(3, 'Charlie', 60),
      balance(4, 'Dave', -100),
    ];
    const result = simplifyDebts(balances);
    const totalOut = result.reduce((sum, t) => sum + t.amount, 0);
    // Total paid out must equal total received
    const totalIn = result.reduce((sum, t) => sum + t.amount, 0);
    expect(totalOut).toBe(totalIn);
    // And creditors get exactly what they're owed
    const received = {};
    result.forEach(t => { received[t.to] = (received[t.to] || 0) + t.amount; });
    expect(Math.round(received[1])).toBe(120);
    expect(Math.round(received[3])).toBe(60);
  });

});