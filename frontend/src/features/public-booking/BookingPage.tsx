import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BookingForm } from '../../components/bookings/BookingForm';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { isApiError } from '../../lib/api-client';
import { addDays, formatCalendarDate, formatLongDate, formatTimeRange, todayInZone } from '../../lib/date-time';
import { describeError } from '../../lib/error-messages';
import { useApiResource } from '../../lib/use-api-resource';
import type { BookingFormErrors, BookingFormValues } from '../../lib/validation';
import { cn } from '../../lib/cn';
import type { Slot } from '../../types/slot';
import { createBooking, listAvailableSlots } from './booking.api';

/** Errors after which the chosen slot can no longer be booked. */
const SLOT_GONE_CODES = new Set(['SLOT_ALREADY_BOOKED', 'SLOT_NOT_AVAILABLE', 'SLOT_NOT_FOUND']);

export function BookingPage() {
  const navigate = useNavigate();
  const today = todayInZone();
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<BookingFormErrors>({});

  const slots = useApiResource((signal) => listAvailableSlots(date, signal), [date]);

  function changeDate(next: string) {
    if (!next || next < today) return;
    setDate(next);
    setSelected(null);
    setNotice(null);
  }

  async function book(values: BookingFormValues) {
    if (!selected) return;
    setNotice(null);
    setServerErrors({});
    try {
      const booking = await createBooking({ timeSlotId: selected.id, ...values });
      void navigate(`/booking/confirmation/${encodeURIComponent(booking.confirmationToken)}`);
    } catch (error) {
      if (isApiError(error) && SLOT_GONE_CODES.has(error.code)) {
        // Someone else got there first: refresh the list so the slot disappears.
        setSelected(null);
        setNotice('Sorry, that time was just booked by someone else. Please choose another time.');
        await slots.reload();
        return;
      }
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        const fieldErrors: BookingFormErrors = {};
        for (const detail of error.details) {
          if (detail.path === 'name' || detail.path === 'email') fieldErrors[detail.path] = detail.message;
        }
        setServerErrors(fieldErrors);
      }
      setNotice(describeError(error));
    }
  }

  return (
    <>
      <PageHeader
        title="Book a mentoring session"
        description="Pick a day and a free time, then enter your name and email. Times are in Europe/Skopje."
      />

      {notice && (
        <Alert tone="error" className="mb-6" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader title="1. Choose a day" />
          <div className="flex flex-wrap items-end gap-3 px-5 py-4">
            <Button
              variant="secondary"
              onClick={() => changeDate(addDays(date, -1))}
              disabled={date <= today}
              aria-label="Previous day"
            >
              ←
            </Button>
            <div className="w-48">
              <TextField
                label="Date"
                type="date"
                min={today}
                value={date}
                onChange={(event) => changeDate(event.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={() => changeDate(addDays(date, 1))} aria-label="Next day">
              →
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="2. Choose a time" description={formatCalendarDate(date)} />
          <div className="px-5 py-4">
            {slots.status === 'loading' && <LoadingState label="Loading available times…" />}
            {slots.status === 'error' && (
              <ErrorState
                title="Could not load available times"
                message={describeError(slots.error)}
                onRetry={() => void slots.reload()}
              />
            )}
            {slots.status === 'success' &&
              (slots.data.length === 0 ? (
                <EmptyState
                  title="No free times on this day"
                  description="Please try another day."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => changeDate(addDays(date, 1))}>
                      Show next day
                    </Button>
                  }
                />
              ) : (
                <ul aria-label="Available times" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.data.map((slot) => {
                    const isSelected = selected?.id === slot.id;
                    return (
                      <li key={slot.id}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelected(slot)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                            isSelected
                              ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                              : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50',
                          )}
                        >
                          <span className="block font-medium tabular-nums text-slate-900">
                            {formatTimeRange(slot.startTime, slot.endTime)}
                          </span>
                          <span className="text-sm text-slate-500">{slot.durationMinutes} min</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </div>
        </Card>

        {selected && (
          <Card>
            <CardHeader
              title="3. Your details"
              description={`${formatLongDate(selected.startTime)}, ${formatTimeRange(selected.startTime, selected.endTime)} (${selected.durationMinutes} min)`}
            />
            <div className="px-5 py-4">
              <BookingForm key={selected.id} onSubmit={book} serverErrors={serverErrors} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
