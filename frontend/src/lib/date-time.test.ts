import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKeyInZone,
  formatCalendarDate,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatTimeRange,
  zonedDateTimeToIso,
} from './date-time';

describe('formatting in Europe/Skopje', () => {
  it('shows summer and winter times correctly (independent of the browser time zone)', () => {
    expect(formatTime('2030-06-03T08:00:00Z')).toBe('10:00'); // CEST, UTC+2
    expect(formatTime('2030-12-03T08:00:00Z')).toBe('09:00'); // CET, UTC+1
    expect(formatTimeRange('2030-06-03T08:00:00Z', '2030-06-03T08:30:00Z')).toBe('10:00–10:30');
  });

  it('uses the Skopje calendar day near midnight', () => {
    // 23:30 UTC on 2 June is already 01:30 on 3 June in Skopje.
    expect(dateKeyInZone('2030-06-02T23:30:00Z')).toBe('2030-06-03');
    expect(formatLongDate('2030-06-02T23:30:00Z')).toBe('Monday, 3 June 2030');
    expect(formatCalendarDate('2030-06-03')).toBe('Monday, 3 June 2030');
  });
});

describe('zonedDateTimeToIso', () => {
  it('adds the correct offset in summer and in winter', () => {
    expect(zonedDateTimeToIso('2030-06-03', '14:00')).toBe('2030-06-03T14:00:00.000+02:00');
    expect(zonedDateTimeToIso('2030-12-03', '14:00')).toBe('2030-12-03T14:00:00.000+01:00');
  });

  it('round-trips through formatTime', () => {
    expect(formatTime(zonedDateTimeToIso('2030-10-27', '09:15'))).toBe('09:15');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-12-31', 1)).toBe('2031-01-01');
    expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
  });
});

describe('formatShortDate', () => {
  const now = new Date('2030-06-01T10:00:00Z');

  it('omits the year for dates in the current year', () => {
    expect(formatShortDate('2030-06-03T08:00:00Z', now)).toBe('Mon 3 Jun');
  });

  it('includes the year for dates in another year', () => {
    expect(formatShortDate('2031-07-14T08:00:00Z', now)).toBe('Mon, 14 Jul 2031');
  });
});
