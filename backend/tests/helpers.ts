import { parseEnv, type AppConfig } from '../src/config/env';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...parseEnv(process.env), ...overrides };
}
