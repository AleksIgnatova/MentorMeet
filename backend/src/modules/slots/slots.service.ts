import { getPgErrorCode, PgErrorCode } from '../../common/db-errors';
import { conflict, ErrorCode, HttpError, notFound } from '../../common/http-errors';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { addMinutes, zonedDayRange } from '../../utils/date-time';
import type { CreateSlotInput, ListSlotsQuery } from './slots.schemas';
import { toSlotDto, type SlotDto } from './slots.types';

export type SlotsServiceDeps = {
  prisma: PrismaClient;
  /** Injectable clock for tests. */
  now?: () => Date;
};

const slotSelect = { id: true, startTime: true, endTime: true, status: true } as const;

const slotNotFound = () => notFound('Time slot not found.', ErrorCode.SLOT_NOT_FOUND);
const slotHasBooking = () =>
  conflict('This time slot has a booking and cannot be deleted.', ErrorCode.SLOT_HAS_BOOKING);

export function createSlotsService({ prisma, now = () => new Date() }: SlotsServiceDeps) {
  return {
    /**
     * Creates an AVAILABLE slot. The end time is always computed here. Overlap
     * is enforced by the `time_slots_no_overlap` exclusion constraint, so it also
     * holds for concurrent requests; a violation becomes 409 SLOT_OVERLAP.
     */
    async createSlot({ startTime, durationMinutes }: CreateSlotInput): Promise<SlotDto> {
      if (startTime.getTime() <= now().getTime()) {
        throw new HttpError(400, ErrorCode.SLOT_IN_PAST, 'startTime must be in the future.');
      }

      try {
        const slot = await prisma.timeSlot.create({
          data: { startTime, endTime: addMinutes(startTime, durationMinutes) },
          select: slotSelect,
        });
        return toSlotDto(slot);
      } catch (error) {
        if (getPgErrorCode(error) === PgErrorCode.EXCLUSION_VIOLATION) {
          throw conflict(
            'This time slot overlaps an existing time slot.',
            ErrorCode.SLOT_OVERLAP,
          );
        }
        throw error;
      }
    },

    /**
     * Slots whose start falls on the calendar days `from`..`to` (inclusive) in
     * Europe/Skopje, ordered by start time. With `status: 'AVAILABLE'`, only
     * bookable slots are returned: AVAILABLE and not yet started.
     */
    async listSlots({ from, to, status }: ListSlotsQuery): Promise<SlotDto[]> {
      const range = zonedDayRange(from, to);
      const where: Prisma.TimeSlotWhereInput =
        status === 'AVAILABLE'
          ? {
              status: 'AVAILABLE',
              AND: [
                { startTime: { gte: range.start, lt: range.end } },
                { startTime: { gt: now() } },
              ],
            }
          : { startTime: { gte: range.start, lt: range.end } };

      const slots = await prisma.timeSlot.findMany({
        where,
        select: slotSelect,
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      });
      return slots.map(toSlotDto);
    },

    async getSlot(id: string): Promise<SlotDto> {
      const slot = await prisma.timeSlot.findUnique({ where: { id }, select: slotSelect });
      if (!slot) throw slotNotFound();
      return toSlotDto(slot);
    },

    /**
     * Permanently deletes a slot that is still AVAILABLE. The status check is
     * part of the DELETE statement itself, so it cannot race with a booking
     * that flips the slot to BOOKED; the FK (ON DELETE RESTRICT) is a backstop.
     */
    async deleteSlot(id: string): Promise<void> {
      let deleted: number;
      try {
        ({ count: deleted } = await prisma.timeSlot.deleteMany({
          where: { id, status: 'AVAILABLE' },
        }));
      } catch (error) {
        if (getPgErrorCode(error) === PgErrorCode.FOREIGN_KEY_VIOLATION) throw slotHasBooking();
        throw error;
      }
      if (deleted === 1) return;

      const existing = await prisma.timeSlot.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw slotNotFound();
      if (existing.status === 'BOOKED') throw slotHasBooking();
      throw conflict('Only available time slots can be deleted.');
    },
  };
}

export type SlotsService = ReturnType<typeof createSlotsService>;
