import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Creates a Prisma client that talks to PostgreSQL through the `pg` driver
 * adapter (Prisma 7 has no Rust query engine). The `schema` query parameter is
 * Prisma-specific, so it is passed to the adapter rather than to `pg`.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');

  const adapter = new PrismaPg({ connectionString: url.toString() }, { schema });
  return new PrismaClient({ adapter });
}

/** Shared client for the application. The connection pool opens lazily on first query. */
export const prisma = createPrismaClient(env.databaseUrl);
