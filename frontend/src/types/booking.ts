import type { Slot } from './slot';

/** Mirrors the backend booking DTOs (backend/src/modules/bookings/bookings.types.ts). */
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export type SessionTimes = Pick<Slot, 'startTime' | 'endTime' | 'durationMinutes'>;

/** `GET /api/bookings/:token`: only what the confirmation page needs. */
export type BookingConfirmation = {
  name: string;
  status: BookingStatus;
  slot: SessionTimes;
};

/** `POST /api/ai/confirmation`: the AI message, or the backend's prepared fallback. */
export type ConfirmationMessage = {
  message: string;
  source: 'ai' | 'fallback';
};

/** `POST /api/bookings` response. */
export type CreatedBooking = BookingConfirmation & { confirmationToken: string };

/** `GET /api/bookings` (host dashboard). */
export type HostBooking = {
  id: string;
  name: string;
  email: string;
  status: BookingStatus;
  createdAt: string;
  slot: Slot;
};

export type CreateBookingRequest = {
  timeSlotId: string;
  name: string;
  email: string;
};
