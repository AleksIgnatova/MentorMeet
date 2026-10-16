import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { createRateLimiter, type RateLimitOptions } from './middleware/rate-limit';
import { createAiRouter } from './modules/ai/ai.routes';
import { createAiService } from './modules/ai/ai.service';
import { createGeminiClient, type TextGenerator } from './modules/ai/gemini.client';
import { createBookingsRouter } from './modules/bookings/bookings.routes';
import { createBookingsService } from './modules/bookings/bookings.service';
import { healthRouter } from './modules/health/health.routes';
import { createSlotsRouter } from './modules/slots/slots.routes';
import { createSlotsService } from './modules/slots/slots.service';

export const JSON_BODY_LIMIT = '10kb';

const DEFAULT_API_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };
/** Stricter limit for creating bookings (public write endpoint), per IP. */
const DEFAULT_BOOKING_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 20 };
/** AI confirmation messages, per IP. Each call may be a paid provider request. */
const DEFAULT_AI_RATE_LIMIT: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 30 };

export type CreateAppOptions = {
  /** Database client. Injected so tests can use the test database. */
  prisma: PrismaClient;
  apiRateLimit?: RateLimitOptions;
  bookingRateLimit?: RateLimitOptions;
  aiRateLimit?: RateLimitOptions;
  /**
   * AI text generator. Defaults to Gemini when GEMINI_API_KEY is set, otherwise
   * none (fallback messages only). Injected by tests so they never call the provider.
   */
  generateText?: TextGenerator;
  aiTimeoutMs?: number;
  aiRetryDelayMs?: number;
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
  const bookingsService = createBookingsService(options);
  app.use(
    '/api/bookings',
    createBookingsRouter(
      bookingsService,
      createRateLimiter(options.bookingRateLimit ?? DEFAULT_BOOKING_RATE_LIMIT),
    ),
  );
  const generateText =
    'generateText' in options
      ? options.generateText
      : config.geminiApiKey
        ? createGeminiClient({ apiKey: config.geminiApiKey, model: config.geminiModel })
        : undefined;
  app.use(
    '/api/ai',
    createAiRouter(
      createAiService({
        prisma: options.prisma,
        generateText,
        timeoutMs: options.aiTimeoutMs,
        retryDelayMs: options.aiRetryDelayMs,
      }),
      createRateLimiter(options.aiRateLimit ?? DEFAULT_AI_RATE_LIMIT),
    ),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeStack: config.nodeEnv === 'development' }));

  return app;
}
