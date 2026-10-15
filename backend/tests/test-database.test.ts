import { getTestDatabaseUrl } from './test-database';

describe('getTestDatabaseUrl', () => {
  const original = process.env.TEST_DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = original;
  });

  it('defaults to the local mentormeet_test database', () => {
    delete process.env.TEST_DATABASE_URL;
    expect(new URL(getTestDatabaseUrl()).pathname).toBe('/mentormeet_test');
  });

  it('refuses a database whose name does not end with _test', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mentormeet';
    expect(() => getTestDatabaseUrl()).toThrow(/must end with "_test"/);
  });

  it('ignores DATABASE_URL entirely', () => {
    delete process.env.TEST_DATABASE_URL;
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://user:pw@prod.example.com:5432/mentormeet';
    try {
      expect(getTestDatabaseUrl()).not.toContain('prod.example.com');
    } finally {
      process.env.DATABASE_URL = previous;
    }
  });
});
