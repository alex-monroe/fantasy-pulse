describe('getEnv', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns env when variables are valid', async () => {
    process.env.YAHOO_CLIENT_ID = 'id';
    process.env.YAHOO_CLIENT_SECRET = 'secret';
    process.env.YAHOO_REDIRECT_URI = 'https://example.com';

    const { getEnv } = await import('./env');
    expect(getEnv().YAHOO_CLIENT_ID).toBe('id');
  });

  it('throws error when variables are missing', async () => {
    delete process.env.YAHOO_CLIENT_ID;
    delete process.env.YAHOO_CLIENT_SECRET;
    delete process.env.YAHOO_REDIRECT_URI;

    const { getEnv } = await import('./env');
    expect(() => getEnv()).toThrow(/Invalid environment variables/);
  });

  it('throws error when redirect uri is invalid', async () => {
    process.env.YAHOO_CLIENT_ID = 'id';
    process.env.YAHOO_CLIENT_SECRET = 'secret';
    process.env.YAHOO_REDIRECT_URI = 'not-a-url';

    const { getEnv } = await import('./env');
    expect(() => getEnv()).toThrow(/YAHOO_REDIRECT_URI/);
  });
});
