const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public';

/**
 * The only database tests may touch. Taken from TEST_DATABASE_URL, never from
 * DATABASE_URL, so a DATABASE_URL in the shell (e.g. production) is never used.
 * The name must end in `_test`, because integration tests truncate tables.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}": its name must end with "_test".`,
    );
  }
  return url;
}
