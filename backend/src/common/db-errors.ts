import { Prisma } from '../generated/prisma/client';

/** PostgreSQL SQLSTATE codes the services react to. */
export const PgErrorCode = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
} as const;

/**
 * Returns the PostgreSQL SQLSTATE of a failed Prisma query, or undefined.
 * With the pg driver adapter it lives at `meta.driverAdapterError.cause.originalCode`.
 * Only the code is read: the rest of `meta` contains row data (e.g. emails).
 */
export function getPgErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { originalCode?: unknown } } }
    | undefined;
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : undefined;
}

/** Returns the name of the violated constraint, if PostgreSQL reported one. */
export function getConstraintName(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const meta = error.meta as
    | {
        driverAdapterError?: {
          cause?: { originalMessage?: unknown; constraint?: { index?: unknown } };
        };
      }
    | undefined;
  const cause = meta?.driverAdapterError?.cause;
  if (typeof cause?.constraint?.index === 'string') return cause.constraint.index;
  const message = typeof cause?.originalMessage === 'string' ? cause.originalMessage : '';
  return /constraint "([^"]+)"/.exec(message)?.[1];
}
