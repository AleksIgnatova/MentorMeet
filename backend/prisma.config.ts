import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Real environment variables win,
// so the test setup can point the CLI at the test database.
const envFile = path.resolve(__dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not every command needs a database (e.g. `prisma generate`), so a missing
    // URL is reported by the commands that do rather than failing here.
    url: process.env.DATABASE_URL ?? '',
  },
});
