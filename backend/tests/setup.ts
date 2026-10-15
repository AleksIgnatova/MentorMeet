import { getTestDatabaseUrl } from './test-database';

// Runs before every test file. Always points at the dedicated test database so
// that tests can never touch development or production data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.GEMINI_API_KEY = '';
