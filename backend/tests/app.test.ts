import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { conflict } from '../src/common/http-errors';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createErrorHandler, describeErrorForLog } from '../src/middleware/error-handler';
import { buildApp, testConfig } from './helpers';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(buildApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok', timestamp: expect.any(String) as string });
    expect(Number.isNaN(Date.parse((res.body as { timestamp: string }).timestamp))).toBe(false);
  });

  it('does not advertise Express', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('404 handling', () => {
  it.each(['/api/does-not-exist', '/somewhere-else'])('returns JSON 404 for %s', async (path) => {
    const res = await request(buildApp()).get(path);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' },
    });
  });
});

describe('JSON body parsing', () => {
  it('returns 400 INVALID_JSON for malformed JSON', async () => {
    const res = await request(buildApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
    });
  });

  it('returns 413 PAYLOAD_TOO_LARGE above the body size limit', async () => {
    const res = await request(buildApp())
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(20 * 1024) }));

    expect(res.status).toBe(413);
    expect((res.body as { error: { code: string } }).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  const config = testConfig({ corsOrigins: ['http://localhost:5173'] });

  it('allows the configured frontend origin', async () => {
    const res = await request(buildApp(config))
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow other origins', async () => {
    const res = await request(buildApp(config))
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests for the configured origin', async () => {
    const res = await request(buildApp(config))
      .options('/api/slots')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED once the API limit is exceeded', async () => {
    const app = buildApp(testConfig(), { apiRateLimit: { windowMs: 60_000, limit: 2 } });

    await request(app).get('/api/unknown').expect(404);
    await request(app).get('/api/unknown').expect(404);
    const res = await request(app).get('/api/unknown');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });

  it('never rate limits the health check', async () => {
    const app = buildApp(testConfig(), { apiRateLimit: { windowMs: 60_000, limit: 1 } });
    for (let i = 0; i < 5; i += 1) {
      await request(app).get('/api/health').expect(200);
    }
  });
});

describe('central error handler', () => {
  function appWithRoutes(exposeStack: boolean, log = jest.fn()) {
    const app = express();
    app.get('/async-crash', async () => {
      await Promise.resolve();
      throw new Error('database password=hunter2 leaked in message');
    });
    app.get('/conflict', () => {
      throw conflict('Slot already booked.', 'CONFLICT');
    });
    app.get('/zod', () => {
      z.object({ email: z.email() }).parse({ email: 'nope' });
    });
    app.use(createErrorHandler({ exposeStack, log }));
    return { app, log };
  }

  it('catches rejected async handlers and hides internals in production', async () => {
    const { app, log } = appWithRoutes(false);
    const res = await request(app).get('/async-crash');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('includes the stack trace only when explicitly enabled (development)', async () => {
    const { app } = appWithRoutes(true);
    const res = await request(app).get('/async-crash');

    expect(res.status).toBe(500);
    expect((res.body as { error: { stack?: string } }).error.stack).toContain('Error:');
  });

  it('passes HttpError status, code and message through without logging', async () => {
    const { app, log } = appWithRoutes(false);
    const res = await request(app).get('/conflict');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'Slot already booked.' } });
    expect(log).not.toHaveBeenCalled();
  });

  it('maps ZodError to 400 VALIDATION_ERROR with field details', async () => {
    const { app } = appWithRoutes(false);
    const res = await request(app).get('/zod');

    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0]?.path).toBe('email');
  });
});

describe('logging of database errors', () => {
  const secretRow = 'Failing row contains (…, Ana Petrova, ana@example.com, token-abc…)';
  const prismaError = () =>
    new Prisma.PrismaClientKnownRequestError('Database error. Code: `23514`.', {
      code: 'P2039',
      clientVersion: Prisma.prismaVersion.client,
      meta: { driverAdapterError: { cause: { originalCode: '23514', detail: secretRow } } },
    });

  it('describeErrorForLog keeps name, code, message and stack frames but never meta', () => {
    const logged = describeErrorForLog(prismaError());
    expect(logged).toContain('PrismaClientKnownRequestError [P2039]: Database error. Code: `23514`.');
    expect(logged).toMatch(/\n\s+at /);
    expect(logged).not.toContain('ana@example.com');
    expect(logged).not.toContain('Failing row');
  });

  it('an unexpected Prisma error returns a generic 500 and logs no row data', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingPrisma = {
      timeSlot: { findUnique: jest.fn().mockRejectedValue(prismaError()) },
    } as unknown as PrismaClient;

    const res = await request(buildApp(testConfig({ nodeEnv: 'production' }), { prisma: failingPrisma })).get(
      '/api/slots/b3c0a7a2-5f0e-4c43-9a57-0c2a3f0e9d11',
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('ana@example.com');
    expect(logged).not.toContain('Failing row');
  });
});
