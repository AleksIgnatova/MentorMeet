import type { Config } from 'jest';

type ProjectConfig = NonNullable<Config['projects']>[number] & object;

const shared: ProjectConfig = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // The generated Prisma client uses `.js` import specifiers for its `.ts` files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  restoreMocks: true,
};

const config: Config = {
  // Integration test files share one test database, so run files one at a time.
  maxWorkers: 1,
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['\\.integration\\.test\\.ts$'],
    },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['**/*.integration.test.ts'],
      // Applies migrations to the test database before any integration test runs.
      globalSetup: '<rootDir>/tests/global-setup.ts',
    },
  ],
};

export default config;
