import {
  createSlotBodySchema,
  listSlotsQuerySchema,
  MAX_RANGE_DAYS,
  slotIdParamsSchema,
} from '../src/modules/slots/slots.schemas';

describe('createSlotBodySchema', () => {
  const valid = { startTime: '2030-06-03T14:00:00+02:00', durationMinutes: 30 };

  it('accepts a valid body and parses startTime to an instant', () => {
    const parsed = createSlotBodySchema.parse(valid);
    expect(parsed.startTime.toISOString()).toBe('2030-06-03T12:00:00.000Z');
    expect(parsed.durationMinutes).toBe(30);
  });

  it.each([15, 30, 45, 60])('accepts duration %i', (durationMinutes) => {
    expect(createSlotBodySchema.safeParse({ ...valid, durationMinutes }).success).toBe(true);
  });

  it.each([0, 10, 20, 90, -30, 30.5, '30', null])('rejects duration %p', (durationMinutes) => {
    expect(createSlotBodySchema.safeParse({ ...valid, durationMinutes }).success).toBe(false);
  });

  it.each(['2030-06-03T14:00:00Z', '2030-06-03T14:00:00.000+02:00', '2030-06-03T14:00:00-05:30'])(
    'accepts ISO date-time with zone %s',
    (startTime) => {
      expect(createSlotBodySchema.safeParse({ ...valid, startTime }).success).toBe(true);
    },
  );

  it.each([
    ['no time zone', '2030-06-03T14:00:00'],
    ['date only', '2030-06-03'],
    ['non-existent date', '2030-02-30T14:00:00+01:00'],
    ['invalid hour', '2030-06-03T25:00:00+02:00'],
    ['free text', 'tomorrow at 2pm'],
    ['empty', ''],
    ['number', 1_900_000_000_000],
  ])('rejects startTime with %s', (_label, startTime) => {
    expect(createSlotBodySchema.safeParse({ ...valid, startTime }).success).toBe(false);
  });

  it.each([
    ['endTime', { endTime: '2030-06-03T15:00:00+02:00' }],
    ['status', { status: 'BOOKED' }],
    ['id', { id: '00000000-0000-4000-8000-000000000000' }],
  ])('rejects client-supplied %s (computed by the server)', (_label, extra) => {
    const result = createSlotBodySchema.safeParse({ ...valid, ...extra });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields and non-object bodies', () => {
    expect(createSlotBodySchema.safeParse({}).success).toBe(false);
    expect(createSlotBodySchema.safeParse(undefined).success).toBe(false);
    expect(createSlotBodySchema.safeParse([valid]).success).toBe(false);
  });
});

describe('listSlotsQuerySchema', () => {
  it('parses dates and the optional AVAILABLE filter', () => {
    expect(
      listSlotsQuerySchema.parse({ from: '2030-10-01', to: '2030-10-31', status: 'AVAILABLE' }),
    ).toEqual({
      from: { year: 2030, month: 10, day: 1 },
      to: { year: 2030, month: 10, day: 31 },
      status: 'AVAILABLE',
    });
  });

  it('accepts a single day and the maximum span', () => {
    expect(listSlotsQuerySchema.safeParse({ from: '2030-01-01', to: '2030-01-01' }).success).toBe(
      true,
    );
    // 2030-01-01 + 92 days = 2030-04-03 -> 93 inclusive days.
    expect(MAX_RANGE_DAYS).toBe(93);
    expect(listSlotsQuerySchema.safeParse({ from: '2030-01-01', to: '2030-04-03' }).success).toBe(
      true,
    );
  });

  it.each([
    ['missing from', { to: '2030-01-01' }],
    ['missing to', { from: '2030-01-01' }],
    ['to before from', { from: '2030-01-02', to: '2030-01-01' }],
    ['range over the maximum', { from: '2030-01-01', to: '2030-04-04' }],
    ['invalid month', { from: '2030-13-01', to: '2030-13-02' }],
    ['non-existent day', { from: '2030-02-29', to: '2030-03-01' }],
    ['wrong format', { from: '01.01.2030', to: '2030-01-02' }],
    ['date-time instead of date', { from: '2030-01-01T00:00:00Z', to: '2030-01-02' }],
    ['repeated parameter', { from: ['2030-01-01', '2030-01-02'], to: '2030-01-03' }],
    ['unsupported status', { from: '2030-01-01', to: '2030-01-02', status: 'BOOKED' }],
  ])('rejects %s', (_label, query) => {
    expect(listSlotsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts 29 February in a leap year', () => {
    expect(listSlotsQuerySchema.safeParse({ from: '2028-02-29', to: '2028-03-01' }).success).toBe(
      true,
    );
  });
});

describe('slotIdParamsSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(slotIdParamsSchema.safeParse({ id: 'b3c0a7a2-5f0e-4c43-9a57-0c2a3f0e9d11' }).success).toBe(
      true,
    );
    expect(slotIdParamsSchema.safeParse({ id: '123' }).success).toBe(false);
    expect(slotIdParamsSchema.safeParse({ id: "1' OR '1'='1" }).success).toBe(false);
  });
});
