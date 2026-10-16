/** Mirrors the backend SlotDto (backend/src/modules/slots/slots.types.ts). */
export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'CANCELLED';

export type Slot = {
  id: string;
  /** ISO 8601 instant in UTC. */
  startTime: string;
  /** ISO 8601 instant in UTC. */
  endTime: string;
  durationMinutes: number;
  status: SlotStatus;
};

export const SLOT_DURATIONS = [15, 30, 45, 60] as const;
export type SlotDuration = (typeof SLOT_DURATIONS)[number];

export type CreateSlotRequest = {
  /** ISO 8601 date-time with an explicit offset, e.g. 2026-10-21T14:00:00+02:00. */
  startTime: string;
  durationMinutes: SlotDuration;
};
