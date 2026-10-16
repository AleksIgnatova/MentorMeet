import { TZDate } from '@date-fns/tz';

/** All dates and times are shown, and entered, in this time zone. */
export const APP_TIME_ZONE = 'Europe/Skopje';
const LOCALE = 'en-GB';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const shortDateWithYearFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "Wednesday, 21 October 2026" in Europe/Skopje. */
export const formatLongDate = (iso: string) => dateFormatter.format(new Date(iso));
/** "Wed 21 Oct" in Europe/Skopje; "Mon, 14 Jul 2031" when not in the current year. */
export const formatShortDate = (iso: string, now: Date = new Date()) =>
  (dateKeyInZone(iso).slice(0, 4) === dateKeyInZone(now).slice(0, 4)
    ? shortDateFormatter
    : shortDateWithYearFormatter
  ).format(new Date(iso));
/** "14:00" in Europe/Skopje (24-hour clock). */
export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));
/** "14:00–14:30". */
export const formatTimeRange = (startIso: string, endIso: string) =>
  `${formatTime(startIso)}–${formatTime(endIso)}`;

/** Calendar day (YYYY-MM-DD) of an instant in Europe/Skopje. */
export const dateKeyInZone = (instant: string | Date) =>
  dateKeyFormatter.format(typeof instant === 'string' ? new Date(instant) : instant);

/** Today's calendar date (YYYY-MM-DD) in Europe/Skopje. */
export const todayInZone = (now: Date = new Date()) => dateKeyInZone(now);

/** Adds calendar days to a YYYY-MM-DD date (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD calendar date as "Wednesday, 21 October 2026". */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  // Noon avoids any DST edge when turning the calendar date into an instant.
  return formatLongDate(new TZDate(year, month - 1, day, 12, 0, APP_TIME_ZONE).toISOString());
}

/**
 * Converts a wall-clock time in Europe/Skopje ("2026-10-21" + "14:00") to an
 * ISO 8601 string with the correct offset ("2026-10-21T14:00:00.000+02:00").
 */
export function zonedDateTimeToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new TZDate(year, month - 1, day, hours, minutes, APP_TIME_ZONE).toISOString();
}
