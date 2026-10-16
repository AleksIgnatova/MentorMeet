import { useState } from 'react';
import { UpcomingBookings } from '../../components/bookings/UpcomingBookings';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageHeader } from '../../components/layout/PageHeader';
import { CreateSlotDialog } from '../../components/slots/CreateSlotDialog';
import { DeleteSlotDialog } from '../../components/slots/DeleteSlotDialog';
import { SlotList } from '../../components/slots/SlotList';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { isApiError } from '../../lib/api-client';
import {
  addDays,
  formatCalendarDate,
  formatShortDate,
  formatTime,
  todayInZone,
} from '../../lib/date-time';
import { describeError } from '../../lib/error-messages';
import { useApiResource } from '../../lib/use-api-resource';
import type { Slot } from '../../types/slot';
import { deleteSlot, listSlots, listUpcomingBookings } from './dashboard.api';

/** Number of days shown in the slot list (well within the API's 93-day limit). */
const RANGE_DAYS = 14;

type Notice = { tone: 'success' | 'error'; text: string };

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function DashboardPage() {
  const today = todayInZone();
  const [from, setFrom] = useState(today);
  const to = addDays(from, RANGE_DAYS - 1);

  const slots = useApiResource((signal) => listSlots({ from, to }, signal), [from, to]);
  const bookings = useApiResource((signal) => listUpcomingBookings(signal), []);

  const [creating, setCreating] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const now = new Date();
  const slotData = slots.data ?? [];
  const availableCount = slotData.filter(
    (slot) => slot.status === 'AVAILABLE' && new Date(slot.startTime) > now,
  ).length;
  const bookedCount = slotData.filter((slot) => slot.status === 'BOOKED').length;
  const nextBooking = bookings.data?.[0];

  async function confirmDelete() {
    if (!slotToDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteSlot(slotToDelete.id);
      setNotice({ tone: 'success', text: 'Slot deleted.' });
    } catch (error) {
      const text =
        isApiError(error) && error.code === 'SLOT_HAS_BOOKING'
          ? 'This slot was booked in the meantime and can no longer be deleted.'
          : isApiError(error) && error.code === 'SLOT_NOT_FOUND'
            ? 'This slot had already been deleted.'
            : describeError(error);
      setNotice({ tone: 'error', text });
    } finally {
      setDeleting(false);
      setSlotToDelete(null);
      void slots.reload();
      void bookings.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Manage your mentoring slots and see upcoming sessions. All times are in Europe/Skopje."
        action={<Button onClick={() => setCreating(true)}>New slot</Button>}
      />

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)} className="mb-6">
          {notice.text}
        </Alert>
      )}

      <section aria-label="Statistics" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Available slots"
          value={slots.status === 'success' ? String(availableCount) : '–'}
          hint={`Next ${RANGE_DAYS} days shown`}
        />
        <StatCard
          label="Booked slots"
          value={slots.status === 'success' ? String(bookedCount) : '–'}
          hint={`Next ${RANGE_DAYS} days shown`}
        />
        <StatCard
          label="Upcoming bookings"
          value={bookings.status === 'success' ? String(bookings.data.length) : '–'}
        />
        <StatCard
          label="Next session"
          value={nextBooking ? formatTime(nextBooking.slot.startTime) : '–'}
          hint={nextBooking ? formatShortDate(nextBooking.slot.startTime) : 'No upcoming sessions'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Time slots"
            description={`${formatCalendarDate(from)} – ${formatCalendarDate(to)}`}
            action={
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFrom(addDays(from, -RANGE_DAYS))}
                  aria-label="Previous period"
                >
                  ←
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setFrom(today)} disabled={from === today}>
                  Today
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFrom(addDays(from, RANGE_DAYS))}
                  aria-label="Next period"
                >
                  →
                </Button>
              </div>
            }
          />
          {slots.status === 'loading' && !slots.data && <LoadingState label="Loading slots…" />}
          {slots.status === 'error' && (
            <ErrorState message={describeError(slots.error)} onRetry={() => void slots.reload()} />
          )}
          {slots.data && slots.status !== 'error' &&
            (slots.data.length === 0 ? (
              <EmptyState
                title="No slots in this period"
                description="Create a slot so visitors can book a session."
                action={<Button size="sm" onClick={() => setCreating(true)}>New slot</Button>}
              />
            ) : (
              <SlotList slots={slots.data} onDelete={setSlotToDelete} now={now} />
            ))}
        </Card>

        <Card>
          <CardHeader title="Upcoming bookings" />
          {bookings.status === 'loading' && !bookings.data && <LoadingState label="Loading bookings…" />}
          {bookings.status === 'error' && (
            <ErrorState message={describeError(bookings.error)} onRetry={() => void bookings.reload()} />
          )}
          {bookings.data && bookings.status !== 'error' &&
            (bookings.data.length === 0 ? (
              <EmptyState title="No upcoming bookings" />
            ) : (
              <UpcomingBookings bookings={bookings.data} />
            ))}
        </Card>
      </div>

      <CreateSlotDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          setNotice({ tone: 'success', text: 'Slot created.' });
          void slots.reload();
        }}
      />
      <DeleteSlotDialog
        slot={slotToDelete}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setSlotToDelete(null)}
      />
    </>
  );
}
