import { TZDate } from '@date-fns/tz';

/** Time zone used to interpret and display calendar dates and wall-clock times. */
export const APP_TIME_ZONE = 'Europe/Skopje';

export type CalendarDate = { year: number; month: number; day: number };

/**
 * Converts a wall-clock time on a calendar date in `timeZone` to an absolute
 * instant, honouring daylight saving time. `month` is 1-based. Out-of-range
 * days roll over like `Date` (e.g. day 32 becomes the next month).
 */
export function zonedTimeToUtc(
  { year, month, day }: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string = APP_TIME_ZONE,
): Date {
  return new Date(new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime());
}

/** The calendar date of `instant` as seen in `timeZone` (1-based month). */
export function calendarDateInZone(
  instant: Date,
  timeZone: string = APP_TIME_ZONE,
): CalendarDate & { weekday: number } {
  const zoned = new TZDate(instant.getTime(), timeZone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    weekday: zoned.getDay(),
  };
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/**
 * Parses a strict `YYYY-MM-DD` calendar date. Returns undefined for malformed or
 * non-existent dates such as 2026-02-30.
 */
export function parseCalendarDate(value: string): CalendarDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Calendar arithmetic only (no time zone involved): reject dates that roll over.
  const probe = new Date(Date.UTC(year, month - 1, day));
  probe.setUTCFullYear(year);
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

/** Number of calendar days from `from` to `to` (0 when equal, negative when `to` is earlier). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  const utc = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day);
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * The half-open instant range [start, end) covering whole calendar days
 * `from`..`to` (inclusive) in `timeZone`. DST days are 23 or 25 hours long.
 */
export function zonedDayRange(
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string = APP_TIME_ZONE,
): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(from, 0, 0, timeZone),
    end: zonedTimeToUtc({ ...to, day: to.day + 1 }, 0, 0, timeZone),
  };
}
