import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { createRateLimiter, type RateLimitOptions } from './middleware/rate-limit';
import { createBookingsRouter } from './modules/bookings/bookings.routes';
import { createBookingsService } from './modules/bookings/bookings.service';
import { healthRouter } from './modules/health/health.routes';
import { createSlotsRouter } from './modules/slots/slots.routes';
import { createSlotsService } from './modules/slots/slots.service';

export const JSON_BODY_LIMIT = '10kb';

const DEFAULT_API_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };
/** Stricter limit for creating bookings (public write endpoint), per IP. */
const DEFAULT_BOOKING_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 20 };

export type CreateAppOptions = {
  /** Database client. Injected so tests can use the test database. */
  prisma: PrismaClient;
  apiRateLimit?: RateLimitOptions;
  bookingRateLimit?: RateLimitOptions;
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Injectable confirmation-token source for tests. */
  generateToken?: () => string;
};

/**
 * Builds the Express application without binding a port, so tests can drive
 * it through Supertest. Express 5 forwards rejected promises from async
 * handlers to the error handler, so no async wrapper is needed.
 */
export function createApp(config: AppConfig, options: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Health checks are mounted before the rate limiter so uptime probes are never throttled.
  app.use('/api/health', healthRouter);

  app.use('/api', createRateLimiter(options.apiRateLimit ?? DEFAULT_API_RATE_LIMIT));
  app.use('/api/slots', createSlotsRouter(createSlotsService(options)));
  app.use(
    '/api/bookings',
    createBookingsRouter(
      createBookingsService(options),
      createRateLimiter(options.bookingRateLimit ?? DEFAULT_BOOKING_RATE_LIMIT),
    ),
  );
  // The AI router is mounted here in a later phase.

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeStack: config.nodeEnv === 'development' }));

  return app;
}
