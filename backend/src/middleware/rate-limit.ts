import { rateLimit } from 'express-rate-limit';
import { ErrorCode, HttpError } from '../common/http-errors';

export type RateLimitOptions = {
  windowMs: number;
  limit: number;
};

export function createRateLimiter({ windowMs, limit }: RateLimitOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new HttpError(429, ErrorCode.RATE_LIMITED, 'Too many requests. Please try again later.'),
      );
    },
  });
}
