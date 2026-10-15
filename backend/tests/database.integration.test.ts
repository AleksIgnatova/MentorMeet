/**
 * Verifies the database schema and constraints from Phase 2 directly against
 * PostgreSQL (the `mentormeet_test` database), independent of any API code.
 */
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestPrismaClient, randomToken, resetDatabase, sqlState } from './db-helpers';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_EXCLUSION_VIOLATION = '23P01';

let prisma: PrismaClient;

/** A fixed day in the future so tests do not depend on the current date. */
const at = (time: string) => new Date(`2030-06-03T${time}:00+02:00`);

function createSlot(start: string, end: string, status?: 'AVAILABLE' | 'BOOKED' | 'CANCELLED') {
  return prisma.timeSlot.create({
    data: { startTime: at(start), endTime: at(end), ...(status ? { status } : {}) },
  });
}

function createBooking(timeSlotId: string, overrides: Partial<{ name: string; email: string; confirmationToken: string }> = {}) {
  return prisma.booking.create({
    data: {
      timeSlotId,
      name: 'Ana Petrova',
      email: 'ana@example.com',
      confirmationToken: randomToken(),
      ...overrides,
    },
  });
}

async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeDefined();
  expect(sqlState(error)).toBe(code);
}

beforeAll(() => {
  prisma = createTestPrismaClient();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('schema', () => {
  it('connects to the test database with all migrations applied', async () => {
    const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0]?.db).toBe('mentormeet_test');

    const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations`;
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.every((m) => m.finished_at !== null)).toBe(true);
  });

  it('applies database defaults: UUID id, AVAILABLE status, timestamps', async () => {
    const slot = await createSlot('10:00', '10:30');
    expect(slot.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(slot.status).toBe('AVAILABLE');
    expect(slot.createdAt).toBeInstanceOf(Date);
    expect(slot.updatedAt).toBeInstanceOf(Date);

    const booking = await createBooking(slot.id);
    expect(booking.status).toBe('CONFIRMED');
  });

  it('stores timestamps as absolute instants (timestamptz)', async () => {
    const slot = await prisma.timeSlot.create({
      data: {
        startTime: new Date('2030-06-03T14:00:00+02:00'),
        endTime: new Date('2030-06-03T14:30:00+02:00'),
      },
    });
    const stored = await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(stored.startTime.toISOString()).toBe('2030-06-03T12:00:00.000Z');

    const columns = await prisma.$queryRaw<{ type: string }[]>`
      SELECT data_type AS type FROM information_schema.columns
      WHERE table_name = 'time_slots' AND column_name = 'start_time'`;
    expect(columns[0]?.type).toBe('timestamp with time zone');
  });
});

describe('time_slots constraints', () => {
  it('rejects a slot whose start is not before its end', async () => {
    await expectSqlState(createSlot('10:30', '10:00'), PG_CHECK_VIOLATION);
    await expectSqlState(createSlot('10:00', '10:00'), PG_CHECK_VIOLATION);
  });

  it.each([
    ['same interval', '10:00', '10:30'],
    ['starts inside', '10:15', '10:45'],
    ['ends inside', '09:45', '10:15'],
    ['contains it', '09:00', '11:00'],
    ['inside it', '10:10', '10:20'],
  ])('rejects an overlapping slot (%s)', async (_label, start, end) => {
    await createSlot('10:00', '10:30');
    await expectSqlState(createSlot(start, end), PG_EXCLUSION_VIOLATION);
  });

  it('allows adjacent slots (half-open intervals)', async () => {
    await createSlot('10:00', '10:30');
    await expect(createSlot('10:30', '11:00')).resolves.toBeDefined();
    await expect(createSlot('09:30', '10:00')).resolves.toBeDefined();
  });

  it('also rejects overlap with a BOOKED slot', async () => {
    await createSlot('10:00', '10:30', 'BOOKED');
    await expectSqlState(createSlot('10:15', '10:45'), PG_EXCLUSION_VIOLATION);
  });

  it('ignores CANCELLED slots when checking overlap', async () => {
    await createSlot('10:00', '10:30', 'CANCELLED');
    await expect(createSlot('10:00', '10:30')).resolves.toBeDefined();
  });

  it('rejects re-activating a cancelled slot that now overlaps an active one', async () => {
    const cancelled = await createSlot('10:00', '10:30', 'CANCELLED');
    await createSlot('10:15', '10:45');
    await expectSqlState(
      prisma.timeSlot.update({ where: { id: cancelled.id }, data: { status: 'AVAILABLE' } }),
      PG_EXCLUSION_VIOLATION,
    );
  });

  it('lets exactly one of several concurrent overlapping inserts succeed', async () => {
    const attempts = ['10:00', '10:05', '10:10', '10:15', '10:20'].map((start) => {
      const [h, m] = start.split(':').map(Number) as [number, number];
      const end = `${String(h).padStart(2, '0')}:${String(m + 30).padStart(2, '0')}`;
      return createSlot(start, end);
    });

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) expect(sqlState(r.reason)).toBe(PG_EXCLUSION_VIOLATION);
    expect(await prisma.timeSlot.count()).toBe(1);
  });
});

describe('bookings constraints', () => {
  it('allows only one booking per time slot', async () => {
    const slot = await createSlot('10:00', '10:30');
    await createBooking(slot.id);
    await expectSqlState(
      createBooking(slot.id, { name: 'Marko', email: 'marko@example.com' }),
      PG_UNIQUE_VIOLATION,
    );
    expect(await prisma.booking.count({ where: { timeSlotId: slot.id } })).toBe(1);
  });

  it('lets exactly one of several concurrent bookings for the same slot succeed', async () => {
    const slot = await createSlot('10:00', '10:30');
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => createBooking(slot.id, { email: `v${i}@example.com` })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.booking.count({ where: { timeSlotId: slot.id } })).toBe(1);
  });

  it('requires an existing time slot', async () => {
    await expectSqlState(
      createBooking('00000000-0000-4000-8000-000000000000'),
      PG_FOREIGN_KEY_VIOLATION,
    );
  });

  it('prevents deleting a slot that has a booking', async () => {
    const slot = await createSlot('10:00', '10:30', 'BOOKED');
    await createBooking(slot.id);
    await expectSqlState(prisma.timeSlot.delete({ where: { id: slot.id } }), PG_FOREIGN_KEY_VIOLATION);
    expect(await prisma.timeSlot.count()).toBe(1);
  });

  it('allows deleting a slot without a booking', async () => {
    const slot = await createSlot('10:00', '10:30');
    await prisma.timeSlot.delete({ where: { id: slot.id } });
    expect(await prisma.timeSlot.count()).toBe(0);
  });

  it('requires unique confirmation tokens', async () => {
    const a = await createSlot('10:00', '10:30');
    const b = await createSlot('11:00', '11:30');
    const token = randomToken();
    await createBooking(a.id, { confirmationToken: token });
    await expectSqlState(createBooking(b.id, { confirmationToken: token }), PG_UNIQUE_VIOLATION);
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['blank email', { email: '' }],
    ['short confirmation token', { confirmationToken: 'short-token' }],
  ])('rejects a %s', async (_label, overrides) => {
    const slot = await createSlot('10:00', '10:30');
    await expectSqlState(createBooking(slot.id, overrides), PG_CHECK_VIOLATION);
  });

  it('rolls back the whole transaction when the booking insert fails', async () => {
    const slot = await createSlot('10:00', '10:30');

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.timeSlot.update({ where: { id: slot.id }, data: { status: 'BOOKED' } });
        await tx.booking.create({
          data: { timeSlotId: slot.id, name: '', email: 'a@example.com', confirmationToken: randomToken() },
        });
      }),
    ).rejects.toBeDefined();

    const after = await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.status).toBe('AVAILABLE');
    expect(await prisma.booking.count()).toBe(0);
  });
});
