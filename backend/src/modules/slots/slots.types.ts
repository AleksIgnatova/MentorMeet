import type { TimeSlot, TimeSlotStatus } from '../../generated/prisma/client';

/** Public representation of a time slot. Instants are ISO 8601 strings in UTC. */
export type SlotDto = {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: TimeSlotStatus;
};

export function toSlotDto(slot: Pick<TimeSlot, 'id' | 'startTime' | 'endTime' | 'status'>): SlotDto {
  return {
    id: slot.id,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    durationMinutes: Math.round((slot.endTime.getTime() - slot.startTime.getTime()) / 60_000),
    status: slot.status,
  };
}
