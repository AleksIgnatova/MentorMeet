import { dateKeyInZone, formatLongDate, formatTimeRange } from '../../lib/date-time';
import type { Slot } from '../../types/slot';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

function groupByDay(slots: Slot[]): { day: string; label: string; slots: Slot[] }[] {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dateKeyInZone(slot.startTime);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups].map(([day, daySlots]) => ({
    day,
    label: formatLongDate(daySlots[0]!.startTime),
    slots: daySlots,
  }));
}

const statusBadge = (slot: Slot, now: Date) => {
  if (slot.status === 'BOOKED') return <Badge tone="indigo">Booked</Badge>;
  if (slot.status === 'CANCELLED') return <Badge tone="slate">Cancelled</Badge>;
  if (new Date(slot.startTime) <= now) return <Badge tone="slate">Past</Badge>;
  return <Badge tone="green">Available</Badge>;
};

/** Host view of slots, grouped by Europe/Skopje calendar day. */
export function SlotList({
  slots,
  onDelete,
  now = new Date(),
}: {
  slots: Slot[];
  onDelete: (slot: Slot) => void;
  now?: Date;
}) {
  return (
    <div className="divide-y divide-slate-100">
      {groupByDay(slots).map((group) => (
        <section key={group.day} aria-label={group.label} className="px-5 py-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{group.label}</h3>
          <ul className="space-y-2">
            {group.slots.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatTimeRange(slot.startTime, slot.endTime)}
                  </span>
                  <span className="text-sm text-slate-500">{slot.durationMinutes} min</span>
                  {statusBadge(slot, now)}
                </div>
                {slot.status === 'AVAILABLE' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(slot)}
                    aria-label={`Delete slot ${formatLongDate(slot.startTime)} ${formatTimeRange(slot.startTime, slot.endTime)}`}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
