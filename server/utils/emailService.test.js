// The module reads provider config at load time, so each test sets env then
// requires a fresh copy via jest.isolateModules.
const loadFresh = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require('./emailService');
  });
  return mod;
};

describe('sendInviteEmail provider selection', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Set to '' rather than delete: the module runs dotenv.config() on every
    // fresh require, which would re-populate deleted keys from the real .env.
    process.env = { ...originalEnv, RESEND_API_KEY: '', EMAIL_USER: '', EMAIL_PASSWORD: '' };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('uses the Resend API when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test_key_not_real';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'resend-msg-123' }),
    });

    const { sendInviteEmail } = loadFresh();
    const result = await sendInviteEmail('friend@example.com', 'Trip', 'Tarni', 'https://app/register?invite=abc');

    expect(result).toEqual({ success: true, messageId: 'resend-msg-123' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );
    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sentBody.to).toBe('friend@example.com');
    expect(sentBody.html).toContain('https://app/register?invite=abc');
  });

  test('throws (not swallows) when the Resend API returns an error', async () => {
    process.env.RESEND_API_KEY = 'test_key_not_real';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'domain is not verified' }),
    });

    const { sendInviteEmail } = loadFresh();
    await expect(
      sendInviteEmail('friend@example.com', 'Trip', 'Tarni', 'https://app/x')
    ).rejects.toThrow('domain is not verified');
  });

  test('throws a clear config error when no provider is configured', async () => {
    const { sendInviteEmail } = loadFresh();
    await expect(
      sendInviteEmail('friend@example.com', 'Trip', 'Tarni', 'https://app/x')
    ).rejects.toThrow('No email provider configured');
  });

  test('does not send the API key anywhere in the request URL', async () => {
    process.env.RESEND_API_KEY = 'test_key_not_real';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'x' }) });

    const { sendInviteEmail } = loadFresh();
    await sendInviteEmail('friend@example.com', 'Trip', 'Tarni', 'https://app/x');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).not.toContain('test_key_not_real');
    expect(opts.headers.Authorization).toBe('Bearer test_key_not_real');
  });
});
