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
