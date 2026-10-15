import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getTestDatabaseUrl } from './test-database';

/** Brings the test database schema up to date before integration tests run. */
export default function globalSetup(): void {
  const backendDir = path.resolve(__dirname, '..');
  try {
    execFileSync(path.join(backendDir, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      'Could not apply migrations to the test database. Is PostgreSQL running (`npm run db:up`)?\n' +
        output,
      { cause: error },
    );
  }
}
