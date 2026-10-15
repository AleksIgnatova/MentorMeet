import type { Booking, BookingStatus, TimeSlot } from '../../generated/prisma/client';
import { toSlotDto, type SlotDto } from '../slots/slots.types';

type BookingWithSlot = Booking & { timeSlot: TimeSlot };

type SessionTimes = Pick<SlotDto, 'startTime' | 'endTime' | 'durationMinutes'>;

/**
 * What the public confirmation page needs, and nothing more: no email, no
 * internal booking id, no token.
 */
export type BookingConfirmationDto = {
  name: string;
  status: BookingStatus;
  slot: SessionTimes;
};

/** Returned once by `POST /api/bookings`: the confirmation view plus the token for its URL. */
export type CreatedBookingDto = BookingConfirmationDto & { confirmationToken: string };

/**
 * Host dashboard view. Contains personal data (name, email); the token is
 * deliberately omitted because the host does not need it.
 */
export type HostBookingDto = {
  id: string;
  name: string;
  email: string;
  status: BookingStatus;
  createdAt: string;
  slot: SlotDto;
};

function sessionTimes(slot: TimeSlot): SessionTimes {
  const { startTime, endTime, durationMinutes } = toSlotDto(slot);
  return { startTime, endTime, durationMinutes };
}

export function toConfirmationDto(booking: BookingWithSlot): BookingConfirmationDto {
  return { name: booking.name, status: booking.status, slot: sessionTimes(booking.timeSlot) };
}

export function toCreatedBookingDto(booking: BookingWithSlot): CreatedBookingDto {
  return { ...toConfirmationDto(booking), confirmationToken: booking.confirmationToken };
}

export function toHostBookingDto(booking: BookingWithSlot): HostBookingDto {
  return {
    id: booking.id,
    name: booking.name,
    email: booking.email,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
    slot: toSlotDto(booking.timeSlot),
  };
}
