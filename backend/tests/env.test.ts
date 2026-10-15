import { EnvValidationError, parseEnv } from '../src/config/env';

const valid = {
  NODE_ENV: 'production',
  PORT: '8080',
  DATABASE_URL: 'postgresql://user:secret@db.example.com:5432/mentormeet',
  FRONTEND_URL: 'https://mentormeet.example.com, https://preview.example.com',
  GEMINI_API_KEY: '',
  TRUST_PROXY: '1',
};

describe('parseEnv', () => {
  it('parses a valid environment', () => {
    const config = parseEnv(valid);
    expect(config).toEqual({
      nodeEnv: 'production',
      isProduction: true,
      port: 8080,
      databaseUrl: valid.DATABASE_URL,
      corsOrigins: ['https://mentormeet.example.com', 'https://preview.example.com'],
      geminiApiKey: undefined,
      trustProxy: 1,
    });
  });

  it('applies defaults for optional values', () => {
    const config = parseEnv({
      DATABASE_URL: valid.DATABASE_URL,
      FRONTEND_URL: 'http://localhost:5173',
    });
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.trustProxy).toBe(0);
    expect(config.geminiApiKey).toBeUndefined();
  });

  it('rejects missing required variables', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
    try {
      parseEnv({});
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('FRONTEND_URL');
    }
  });

  it.each([
    ['non-postgres DATABASE_URL', { DATABASE_URL: 'mysql://localhost/db' }],
    ['invalid PORT', { PORT: 'abc' }],
    ['out-of-range PORT', { PORT: '70000' }],
    ['invalid NODE_ENV', { NODE_ENV: 'staging' }],
    ['non-URL FRONTEND_URL', { FRONTEND_URL: 'not a url' }],
  ])('rejects %s', (_label, override) => {
    expect(() => parseEnv({ ...valid, ...override })).toThrow(EnvValidationError);
  });

  it('does not echo secret values in error messages', () => {
    const secretUrl = 'mysql://admin:topsecret@host/db';
    let message = '';
    try {
      parseEnv({ ...valid, DATABASE_URL: secretUrl });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('topsecret');
  });
});
