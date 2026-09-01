// Stub the DB pool so requiring the controller doesn't open a real PG connection.
jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));

const { buildInviteLink } = require('./groupController');

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
