// Runs before every test file. Points at the dedicated test database so that
// tests can never touch development or production data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.GEMINI_API_KEY = '';
