import { addMinutes, calendarDateInZone, zonedTimeToUtc } from '../src/utils/date-time';

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
