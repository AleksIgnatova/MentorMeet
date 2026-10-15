import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/lib/prisma';
import { getTestDatabaseUrl } from './test-database';

export function createTestPrismaClient(): PrismaClient {
  return createPrismaClient(getTestDatabaseUrl());
}

/** Empties all application tables. Guarded: only ever runs against a `_test` database. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  getTestDatabaseUrl();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "bookings", "time_slots" RESTART IDENTITY CASCADE');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * PostgreSQL SQLSTATE of a failed Prisma query. With the pg driver adapter it is
 * at `meta.driverAdapterError.cause.originalCode` (Prisma's own `code` is a P-code).
 */
export function sqlState(error: unknown): string | undefined {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    ?.meta;
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : undefined;
}
