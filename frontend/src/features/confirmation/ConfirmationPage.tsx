import { Link, useParams } from 'react-router';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { Card } from '../../components/ui/Card';
import { isApiError } from '../../lib/api-client';
import { formatLongDate, formatTimeRange } from '../../lib/date-time';
import { describeError } from '../../lib/error-messages';
import { useApiResource } from '../../lib/use-api-resource';
import type { BookingConfirmation } from '../../types/booking';
import { getConfirmation } from './confirmation.api';

/** Static message until the optional AI-generated message is added (Phase 6). */
const fallbackMessage = (name: string) =>
  `Thank you, ${name}! Your mentoring session is confirmed. Come with a question or topic in mind, and you'll get the most out of your time together.`;

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-28 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function ConfirmationDetails({ booking }: { booking: BookingConfirmation }) {
  const { slot } = booking;
  return (
    <Card className="overflow-hidden">
      <div className="bg-emerald-50 px-6 py-5">
        <p className="text-sm font-medium text-emerald-700">Booking saved</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {booking.status === 'CONFIRMED' ? 'Your session is booked' : 'This booking was cancelled'}
        </h1>
      </div>
      <dl className="space-y-3 px-6 py-5">
        <Detail label="Name" value={booking.name} />
        <Detail label="Date" value={formatLongDate(slot.startTime)} />
        <Detail label="Time" value={`${formatTimeRange(slot.startTime, slot.endTime)} (Europe/Skopje)`} />
        <Detail label="Duration" value={`${slot.durationMinutes} minutes`} />
      </dl>
      <div className="border-t border-slate-100 px-6 py-5">
        <p className="text-slate-700">{fallbackMessage(booking.name)}</p>
        <p className="mt-4 text-sm text-slate-500">
          Bookmark this page: it shows your booking details at any time.
        </p>
      </div>
    </Card>
  );
}

export function ConfirmationPage() {
  const { token = '' } = useParams();
  const booking = useApiResource((signal) => getConfirmation(token, signal), [token]);

  return (
    <div className="space-y-6">
      {booking.status === 'loading' && <LoadingState label="Loading your booking…" />}

      {booking.status === 'error' &&
        (isApiError(booking.error) && booking.error.status === 404 ? (
          <Card>
            <ErrorState
              title="Booking not found"
              message="This confirmation link is invalid or incomplete. Please check that you copied the whole link."
            />
          </Card>
        ) : (
          <Card>
            <ErrorState
              title="Could not load your booking"
              message={describeError(booking.error)}
              onRetry={() => void booking.reload()}
            />
          </Card>
        ))}

      {booking.status === 'success' && <ConfirmationDetails booking={booking.data} />}

      <p className="text-center text-sm">
        <Link to="/book" className="font-medium text-brand-700 hover:text-brand-800">
          Book another session
        </Link>
      </p>
    </div>
  );
}
