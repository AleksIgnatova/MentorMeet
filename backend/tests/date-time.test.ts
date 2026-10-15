import {
  addMinutes,
  calendarDateInZone,
  calendarDaysBetween,
  parseCalendarDate,
  zonedDayRange,
  zonedTimeToUtc,
} from '../src/utils/date-time';

describe('zonedTimeToUtc (Europe/Skopje)', () => {
  // In 2026, CEST (UTC+2) ends on Sunday 25 October and CET (UTC+1) ends on Sunday 29 March.
  it('uses UTC+2 during summer time', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 10, day: 24 }, 10, 0).toISOString()).toBe(
      '2026-10-24T08:00:00.000Z',
    );
  });

  it('uses UTC+1 after the autumn DST change', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 10, day: 26 }, 10, 0).toISOString()).toBe(
      '2026-10-26T09:00:00.000Z',
    );
  });

  it('handles the spring DST change', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 28 }, 10, 0).toISOString()).toBe(
      '2026-03-28T09:00:00.000Z',
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 30 }, 10, 0).toISOString()).toBe(
      '2026-03-30T08:00:00.000Z',
    );
  });

  it('rolls over out-of-range days into the next month', () => {
    expect(zonedTimeToUtc({ year: 2026, month: 10, day: 32 }, 9, 0).toISOString()).toBe(
      '2026-11-01T08:00:00.000Z',
    );
  });
});

describe('calendarDateInZone', () => {
  it('returns the Skopje calendar date, which can differ from the UTC date', () => {
    // 23:30 UTC on 31 Dec is already 00:30 on 1 Jan in Skopje (UTC+1).
    expect(calendarDateInZone(new Date('2026-12-31T23:30:00Z'))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      weekday: 5,
    });
  });
});

describe('addMinutes', () => {
  it('adds absolute minutes, unaffected by DST', () => {
    // 02:30 CEST + 60 min across the 03:00 -> 02:00 fallback = 02:30 CET.
    const start = new Date('2026-10-25T00:30:00Z');
    expect(addMinutes(start, 60).toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('parseCalendarDate', () => {
  it('parses valid dates, including leap days', () => {
    expect(parseCalendarDate('2026-10-15')).toEqual({ year: 2026, month: 10, day: 15 });
    expect(parseCalendarDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-1-5', '15.10.2026', '', '2026-10-15T00:00'])(
    'rejects %p',
    (value) => {
      expect(parseCalendarDate(value)).toBeUndefined();
    },
  );
});

describe('calendarDaysBetween', () => {
  it('counts calendar days, unaffected by DST', () => {
    const d = (day: number, month = 10) => ({ year: 2026, month, day });
    expect(calendarDaysBetween(d(15), d(15))).toBe(0);
    expect(calendarDaysBetween(d(24), d(26))).toBe(2);
    expect(calendarDaysBetween(d(26), d(24))).toBe(-2);
    expect(calendarDaysBetween(d(1, 1), d(1, 4))).toBe(90);
  });
});

describe('zonedDayRange (Europe/Skopje)', () => {
  it('spans whole local days, with an inclusive end day', () => {
    const range = zonedDayRange({ year: 2026, month: 6, day: 2 }, { year: 2026, month: 6, day: 4 });
    expect(range.start.toISOString()).toBe('2026-06-01T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-06-04T22:00:00.000Z');
  });

  it('is 25 hours long on the day summer time ends', () => {
    const day = { year: 2026, month: 10, day: 25 };
    const range = zonedDayRange(day, day);
    expect(range.start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});
