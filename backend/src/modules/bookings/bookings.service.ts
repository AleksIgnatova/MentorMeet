import { randomBytes } from 'node:crypto';
import { getConstraintName, getPgErrorCode, PgErrorCode } from '../../common/db-errors';
import { conflict, ErrorCode, notFound } from '../../common/http-errors';
import type { PrismaClient } from '../../generated/prisma/client';
import type { CreateBookingInput, ListBookingsQuery } from './bookings.schemas';
import { isWellFormedToken } from './bookings.schemas';
import {
  toConfirmationDto,
  toCreatedBookingDto,
  toHostBookingDto,
  type BookingConfirmationDto,
  type CreatedBookingDto,
  type HostBookingDto,
} from './bookings.types';

/** 32 bytes = 256 bits of entropy, encoded as 43 base64url characters. */
export function generateConfirmationToken(): string {
  return randomBytes(32).toString('base64url');
}

export type BookingsServiceDeps = {
  prisma: PrismaClient;
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Injectable token source for tests. Must return a cryptographically random token in production. */
  generateToken?: () => string;
};

const BOOKING_ONE_PER_SLOT_CONSTRAINT = 'bookings_time_slot_id_key';

const slotAlreadyBooked = () =>
  conflict('This time slot is no longer available.', ErrorCode.SLOT_ALREADY_BOOKED);

export function createBookingsService({
  prisma,
  now = () => new Date(),
  generateToken = generateConfirmationToken,
}: BookingsServiceDeps) {
  return {
    /**
     * Books a slot atomically. In one transaction (READ COMMITTED):
     *  1. UPDATE the slot to BOOKED only if it is still AVAILABLE and in the future.
     *     PostgreSQL row-locks the slot, so a concurrent request waits, then
     *     re-evaluates the WHERE clause against the committed row and updates 0 rows.
     *  2. Exactly one updated row is required; otherwise report why (404/409).
     *  3. INSERT the booking. Any failure rolls back step 1.
     * The UNIQUE constraint on bookings.time_slot_id is a second line of defence.
     */
    async createBooking(input: CreateBookingInput): Promise<CreatedBookingDto> {
      const at = now();
      try {
        const booking = await prisma.$transaction(async (tx) => {
          const { count } = await tx.timeSlot.updateMany({
            where: { id: input.timeSlotId, status: 'AVAILABLE', startTime: { gt: at } },
            data: { status: 'BOOKED' },
          });

          if (count !== 1) {
            const slot = await tx.timeSlot.findUnique({
              where: { id: input.timeSlotId },
              select: { status: true },
            });
            if (!slot) throw notFound('Time slot not found.', ErrorCode.SLOT_NOT_FOUND);
            if (slot.status === 'BOOKED') throw slotAlreadyBooked();
            throw conflict(
              'This time slot can no longer be booked.',
              ErrorCode.SLOT_NOT_AVAILABLE,
            );
          }

          return tx.booking.create({
            data: {
              timeSlotId: input.timeSlotId,
              name: input.name,
              email: input.email,
              confirmationToken: generateToken(),
            },
            include: { timeSlot: true },
          });
        });
        return toCreatedBookingDto(booking);
      } catch (error) {
        if (
          getPgErrorCode(error) === PgErrorCode.UNIQUE_VIOLATION &&
          getConstraintName(error) === BOOKING_ONE_PER_SLOT_CONSTRAINT
        ) {
          throw slotAlreadyBooked();
        }
        throw error;
      }
    },

    /** Public confirmation lookup. Unknown and malformed tokens both give 404. */
    async getConfirmation(token: string): Promise<BookingConfirmationDto> {
      const booking = isWellFormedToken(token)
        ? await prisma.booking.findUnique({
            where: { confirmationToken: token },
            include: { timeSlot: true },
          })
        : null;
      if (!booking) throw notFound('Booking not found.', ErrorCode.BOOKING_NOT_FOUND);
      return toConfirmationDto(booking);
    },

    /**
     * Host dashboard list, ordered by session start. With `upcoming`, only
     * bookings whose session has not ended yet.
     */
    async listBookings({ upcoming }: ListBookingsQuery): Promise<HostBookingDto[]> {
      const bookings = await prisma.booking.findMany({
        where: upcoming ? { timeSlot: { endTime: { gt: now() } } } : {},
        include: { timeSlot: true },
        orderBy: [{ timeSlot: { startTime: 'asc' } }, { createdAt: 'asc' }],
      });
      return bookings.map(toHostBookingDto);
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
