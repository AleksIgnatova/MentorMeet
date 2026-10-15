import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../src/app';
import { parseEnv, type AppConfig } from '../src/config/env';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestPrismaClient } from './db-helpers';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...parseEnv(process.env), ...overrides };
}

let sharedClient: PrismaClient | undefined;

/** Prisma client for the test database. Connects lazily, on the first query. */
export function testPrisma(): PrismaClient {
  sharedClient ??= createTestPrismaClient();
  return sharedClient;
}

export function buildApp(
  config: AppConfig = testConfig(),
  options: Partial<CreateAppOptions> = {},
): Express {
  return createApp(config, { prisma: testPrisma(), ...options });
}
