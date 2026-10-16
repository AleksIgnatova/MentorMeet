import { apiClient } from '../../lib/api-client';
import type { CreateBookingRequest, CreatedBooking } from '../../types/booking';
import type { Slot } from '../../types/slot';

/** Bookable slots on one Europe/Skopje calendar day (AVAILABLE and not started yet). */
export const listAvailableSlots = (date: string, signal?: AbortSignal) =>
  apiClient.request<Slot[]>('/slots', {
    query: { from: date, to: date, status: 'AVAILABLE' },
    signal,
  });

export const createBooking = (input: CreateBookingRequest) =>
  apiClient.request<CreatedBooking>('/bookings', { method: 'POST', body: input });
