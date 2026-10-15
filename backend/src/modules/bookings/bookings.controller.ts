import type { RequestHandler } from 'express';
import { dataResponse } from '../../utils/api-response';
import { createBookingBodySchema, listBookingsQuerySchema } from './bookings.schemas';
import type { BookingsService } from './bookings.service';

/** Thin HTTP layer: validate (ZodError -> 400), call the service, shape the response. */
export function createBookingsController(service: BookingsService) {
  const create: RequestHandler = async (req, res) => {
    const input = createBookingBodySchema.parse(req.body);
    const booking = await service.createBooking(input);
    res.status(201).json(dataResponse(booking));
  };

  const getByToken: RequestHandler<{ token: string }> = async (req, res) => {
    const confirmation = await service.getConfirmation(req.params.token);
    // The token works like a password for this page: keep responses out of caches.
    res.set('Cache-Control', 'no-store').status(200).json(dataResponse(confirmation));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listBookingsQuerySchema.parse(req.query);
    res.set('Cache-Control', 'no-store').status(200).json(dataResponse(await service.listBookings(query)));
  };

  return { create, getByToken, list };
}
