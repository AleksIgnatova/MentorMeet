import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
  FRONTEND_URL: z
    .string({ error: 'FRONTEND_URL is required' })
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1, 'FRONTEND_URL must contain an origin')),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  geminiApiKey: string | undefined;
  trustProxy: number;
};

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates raw environment variables. Pure so it can be unit tested;
 * error messages name the variable but never echo its value.
 */
export function parseEnv(source: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  const env = result.data;
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.FRONTEND_URL,
    geminiApiKey: env.GEMINI_API_KEY,
    trustProxy: env.TRUST_PROXY,
  });
}

function loadDotEnv(): void {
  // Tests configure their own environment in tests/setup.ts.
  if (process.env.NODE_ENV === 'test') return;
  const file = path.resolve(process.cwd(), '.env');
  // Variables already present in the real environment take precedence.
  if (existsSync(file)) process.loadEnvFile(file);
}

loadDotEnv();

export const env: AppConfig = parseEnv(process.env);
