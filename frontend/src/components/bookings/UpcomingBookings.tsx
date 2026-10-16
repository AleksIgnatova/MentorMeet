import { formatShortDate, formatTimeRange } from '../../lib/date-time';
import type { HostBooking } from '../../types/booking';

export function UpcomingBookings({ bookings }: { bookings: HostBooking[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {bookings.map((booking) => (
        <li key={booking.id} className="px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-slate-900">{booking.name}</p>
            <p className="text-sm tabular-nums text-slate-600">
              {formatShortDate(booking.slot.startTime)} ·{' '}
              {formatTimeRange(booking.slot.startTime, booking.slot.endTime)}
            </p>
          </div>
          <p className="truncate text-sm text-slate-500">{booking.email}</p>
        </li>
      ))}
    </ul>
  );
}
