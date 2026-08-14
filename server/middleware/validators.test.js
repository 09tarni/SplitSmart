const { addMemberValidator } = require('./validators');
const { validationResult } = require('express-validator');

const runValidator = async (payload) => {
  const req = { body: payload };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();

  for (const mw of addMemberValidator) {
    mw(req, res, next);
  }

  await new Promise((resolve) => setImmediate(resolve));

  return {
    errors: validationResult(req).array(),
    nextCalled: next.mock.calls.length > 0,
  };
};

describe('addMemberValidator', () => {
  test('accepts an email-based member invite', async () => {
    const result = await runValidator({ email: 'newperson@example.com' });
    expect(result.errors).toHaveLength(0);
    expect(result.nextCalled).toBe(true);
  });

  test('rejects invalid email addresses', async () => {
    const result = await runValidator({ email: 'not-an-email' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].msg).toMatch(/valid email/i);
  });
});
