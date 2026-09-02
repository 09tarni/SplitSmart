// Stub the DB pool so requiring the controller doesn't open a real PG connection.
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const pool = require('../db');
const { buildInviteLink, addMember } = require('./groupController');

describe('buildInviteLink', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('falls back to localhost in non-production environments', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;
    delete process.env.NODE_ENV;

    expect(buildInviteLink('abc123')).toBe('http://localhost:3000/register?invite=abc123');
  });

  test('throws in production when frontend env vars are missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;

    expect(() => buildInviteLink('abc123')).toThrow(
      'FRONTEND_URL/CLIENT_URL is required in production so invite links are valid'
    );
  });

  test('prefers FRONTEND_URL when configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://app.example.com';
    delete process.env.CLIENT_URL;

    expect(buildInviteLink('abc123')).toBe('https://app.example.com/register?invite=abc123');
  });

  test('uses the first entry of a comma-separated FRONTEND_URL and trims a trailing slash', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://app.example.com/ , http://localhost:3000';

    expect(buildInviteLink('abc123')).toBe('https://app.example.com/register?invite=abc123');
  });

  test('throws when the invite token is missing (never emits invite=undefined)', () => {
    process.env.FRONTEND_URL = 'https://app.example.com';

    expect(() => buildInviteLink(undefined)).toThrow('without an invite token');
  });
});

describe('addMember — email-based invitation flow (no email sending)', () => {
  const originalEnv = process.env;
  let emit;
  let io;
  let res;

  const makeReq = (email) => ({
    body: { email },
    params: { id: '7' },
    user: { id: 1, name: 'Alice' },
    app: { get: (key) => (key === 'io' ? io : undefined) },
  });

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', FRONTEND_URL: 'https://app.example.com' };
    pool.query.mockReset();
    emit = jest.fn();
    io = { to: jest.fn(() => ({ emit })) };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // CASE 1 — email belongs to an existing user
  test('adds an existing user directly and notifies them, without sending email', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 42, name: 'Bob' }] }) // users lookup
      .mockResolvedValueOnce({ rows: [] })                        // duplicate-member check
      .mockResolvedValueOnce({ rows: [] })                        // INSERT group_members
      .mockResolvedValueOnce({ rows: [{ name: 'Trip' }] });       // group name

    await addMember(makeReq('bob@example.com'), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      addedDirectly: true,
      message: 'Bob was added to the group',
    });

    // group room still told a member joined
    expect(io.to).toHaveBeenCalledWith('group:7');
    expect(emit).toHaveBeenCalledWith('member_added', expect.objectContaining({ groupId: '7' }));

    // added user notified directly, with a link to open the group
    expect(io.to).toHaveBeenCalledWith('user:42');
    expect(emit).toHaveBeenCalledWith(
      'group_invite',
      expect.objectContaining({ groupId: 7, link: '/groups/7', groupName: 'Trip' })
    );

    // no INSERT into pending_invites
    const statements = pool.query.mock.calls.map((c) => c[0]);
    expect(statements.some((s) => /pending_invites/.test(s))).toBe(false);
  });

  test('preserves the duplicate-member check for an existing user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 42, name: 'Bob' }] }) // users lookup
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });      // already a member

    await addMember(makeReq('bob@example.com'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'User is already a member' });
    expect(emit).not.toHaveBeenCalled();
  });

  // CASE 2 — no account for this email
  test('creates a pending invite and returns the link for a non-user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // users lookup — none
      .mockResolvedValueOnce({ rows: [] }) // existing pending invite — none
      .mockResolvedValueOnce({ rows: [] }); // INSERT pending_invites

    await addMember(makeReq('newperson@example.com'), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.isNew).toBe(true);
    expect(payload.inviteStatus).toBe('pending');
    expect(payload.inviteLink).toMatch(/^https:\/\/app\.example\.com\/register\?invite=[a-f0-9]{64}$/);
    expect(payload.emailSent).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  test('reuses the existing token when a pending invite already exists', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // users lookup — none
      .mockResolvedValueOnce({ rows: [{ id: 9, status: 'pending', invite_token: 'existingtoken123' }] });

    await addMember(makeReq('newperson@example.com'), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      isNew: false,
      inviteStatus: 'pending',
      inviteLink: 'https://app.example.com/register?invite=existingtoken123',
    });
    // no new INSERT
    const statements = pool.query.mock.calls.map((c) => c[0]);
    expect(statements.some((s) => /INSERT INTO pending_invites/.test(s))).toBe(false);
  });
});
