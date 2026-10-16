import { formatLongDate, formatTimeRange } from '../../lib/date-time';
import type { Slot } from '../../types/slot';
import { ConfirmDialog } from '../common/ConfirmDialog';

export function DeleteSlotDialog({
  slot,
  busy,
  onConfirm,
  onCancel,
}: {
  slot: Slot | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={slot !== null}
      title="Delete this slot?"
      confirmLabel="Delete slot"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {slot && (
        <p className="text-sm text-slate-600">
          {formatLongDate(slot.startTime)}, {formatTimeRange(slot.startTime, slot.endTime)}. Visitors
          will no longer be able to book it. This cannot be undone.
        </p>
      )}
    </ConfirmDialog>
  );
}
