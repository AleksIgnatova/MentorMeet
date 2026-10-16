import { Router, type RequestHandler } from 'express';
import { createAiController } from './ai.controller';
import type { AiService } from './ai.service';

/**
 * Mounted at /api/ai. Public (the confirmation page has only the token), so it
 * has its own stricter rate limiter: each call may cost a paid provider request.
 */
export function createAiRouter(service: AiService, limiter: RequestHandler): Router {
  const controller = createAiController(service);
  const router = Router();

  router.post('/confirmation', limiter, controller.confirmation);

  return router;
}
