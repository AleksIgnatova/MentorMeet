import { Router, type RequestHandler } from 'express';
import { createBookingsController } from './bookings.controller';
import type { BookingsService } from './bookings.service';

/**
 * Mounted at /api/bookings. All routes are public by design: the project
 * explicitly requires no authentication. `GET /` returns visitors' personal
 * data for the host dashboard; see README "Known limitations".
 */
export function createBookingsRouter(
  service: BookingsService,
  createBookingLimiter: RequestHandler,
): Router {
  const controller = createBookingsController(service);
  const router = Router();

  router.post('/', createBookingLimiter, controller.create);
  router.get('/', controller.list);
  router.get('/:token', controller.getByToken);

  return router;
}
