import { Router } from 'express';
import { createSlotsController } from './slots.controller';
import type { SlotsService } from './slots.service';

/**
 * Mounted at /api/slots.
 * NOTE: POST and DELETE are host operations and have no authentication in this
 * demo version (see README "Known limitations").
 */
export function createSlotsRouter(service: SlotsService): Router {
  const controller = createSlotsController(service);
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.delete('/:id', controller.remove);

  return router;
}
