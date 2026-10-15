/**
 * Double-booking prevention under concurrency, against the real test database.
 *
 * - Parallel bursts: many simultaneous requests for one slot -> exactly one wins.
 * - Deterministic interleavings: a raw transaction holds the slot's row lock
 *   while an API request is provably blocked on it, then commits or rolls back.
 * - Booking vs. delete races.
 * After each scenario, the invariant "slot is BOOKED <=> a booking exists" is checked.
 */
import { Client } from 'pg';
import request from 'supertest';
import type { CreatedBookingDto } from '../src/modules/bookings/bookings.types';
import { randomToken, resetDatabase } from './db-helpers';
import { buildApp, testConfig, testPrisma } from './helpers';
import { getTestDatabaseUrl } from './test-database';

const Y = new Date().getUTCFullYear() + 2;
const june = (day: number, time: string) => `${Y}-06-${String(day).padStart(2, '0')}T${time}:00+02:00`;

type ErrorBody = { error: { code: string } };

const prisma = testPrisma();
const app = buildApp(testConfig(), { bookingRateLimit: { windowMs: 60_000, limit: 10_000 } });

const insertSlot = (start: string, minutes = 30) =>
  prisma.timeSlot.create({
    data: { startTime: new Date(start), endTime: new Date(new Date(start).getTime() + minutes * 60_000) },
  });

const book = (timeSlotId: string, i = 0) =>
  request(app)
    .post('/api/bookings')
    .send({ timeSlotId, name: `Visitor ${i}`, email: `visitor${i}@example.com` });

function rawClient(): Client {
  const url = new URL(getTestDatabaseUrl());
  url.searchParams.delete('schema');
  return new Client({ connectionString: url.toString() });
}

/** Rows where slot status and booking existence disagree. Must always be 0. */
async function invariantViolations(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
    FROM time_slots s
    LEFT JOIN bookings b ON b.time_slot_id = s.id
    WHERE (s.status = 'BOOKED') <> (b.id IS NOT NULL)`;
  return Number(row?.n ?? -1);
}

/** Waits until some session in the test database is blocked waiting for a lock. */
async function waitForBlockedSession(observer: Client, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock' AND state = 'active'`,
    );
    if (Number(rows[0]?.n) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('No session became blocked on a lock in time');
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('parallel bursts', () => {
  it('exactly one of 10 simultaneous bookings for the same slot succeeds', async () => {
    const slot = await insertSlot(june(3, '10:00'));

    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => book(slot.id, i)));

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    for (const r of conflicts) expect((r.body as ErrorBody).error.code).toBe('SLOT_ALREADY_BOOKED');

    const bookings = await prisma.booking.findMany({ where: { timeSlotId: slot.id } });
    expect(bookings).toHaveLength(1);
    // The stored booking belongs to the request that got 201.
    const winner = (created[0]!.body as { data: CreatedBookingDto }).data;
    expect(bookings[0]!.confirmationToken).toBe(winner.confirmationToken);
    expect(bookings[0]!.name).toBe(winner.name);
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('BOOKED');
    expect(await invariantViolations()).toBe(0);
  });

  it('stays correct over repeated rounds on several slots at once', async () => {
    for (let round = 0; round < 3; round += 1) {
      await resetDatabase(prisma);
      const fresh = await Promise.all([1, 2, 3, 4].map((day) => insertSlot(june(day, '10:00'))));
      const responses = await Promise.all(
        fresh.flatMap((s) => Array.from({ length: 6 }, (_, i) => book(s.id, i).then((r) => ({ slot: s.id, r })))),
      );

      for (const s of fresh) {
        const forSlot = responses.filter((x) => x.slot === s.id).map((x) => x.r.status).sort();
        expect(forSlot).toEqual([201, 409, 409, 409, 409, 409]);
      }
      expect(await prisma.booking.count()).toBe(fresh.length);
      expect(await invariantViolations()).toBe(0);
    }
  });

  it('does not produce false conflicts for simultaneous bookings of different slots', async () => {
    const slots = await Promise.all(
      ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'].map((t) => insertSlot(june(3, t))),
    );
    const responses = await Promise.all(slots.map((s, i) => book(s.id, i)));
    expect(responses.map((r) => r.status)).toEqual(slots.map(() => 201));
    expect(await prisma.booking.count()).toBe(slots.length);
    expect(await invariantViolations()).toBe(0);
  });
});

describe('deterministic interleavings (row lock held by another transaction)', () => {
  let holder: Client;
  let observer: Client;

  beforeEach(async () => {
    holder = rawClient();
    observer = rawClient();
    await Promise.all([holder.connect(), observer.connect()]);
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await Promise.all([holder.end(), observer.end()]);
  });

  it('a request that waited for a competing booking to commit gets 409, not a second booking', async () => {
    const slot = await insertSlot(june(3, '10:00'));

    // Competing booking: same steps as the service, but not yet committed.
    await holder.query('BEGIN');
    const updated = await holder.query(
      `UPDATE time_slots SET status = 'BOOKED', updated_at = now()
       WHERE id = $1 AND status = 'AVAILABLE' AND start_time > now()`,
      [slot.id],
    );
    expect(updated.rowCount).toBe(1);
    await holder.query(
      `INSERT INTO bookings (time_slot_id, name, email, confirmation_token) VALUES ($1, 'First', 'first@example.com', $2)`,
      [slot.id, randomToken()],
    );

    // The API request must block on the slot's row lock...
    const pending = book(slot.id, 2).then((r) => r);
    await waitForBlockedSession(observer);

    // ...and after the competitor commits, re-check the row and give up.
    await holder.query('COMMIT');
    const res = await pending;

    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_ALREADY_BOOKED');
    const bookings = await prisma.booking.findMany({ where: { timeSlotId: slot.id } });
    expect(bookings.map((b) => b.name)).toEqual(['First']);
    expect(await invariantViolations()).toBe(0);
  });

  it('a request that waited for a competing booking that rolled back succeeds', async () => {
    const slot = await insertSlot(june(3, '10:00'));

    await holder.query('BEGIN');
    await holder.query(`UPDATE time_slots SET status = 'BOOKED' WHERE id = $1`, [slot.id]);

    const pending = book(slot.id, 2).then((r) => r);
    await waitForBlockedSession(observer);

    await holder.query('ROLLBACK');
    const res = await pending;

    expect(res.status).toBe(201);
    const bookings = await prisma.booking.findMany({ where: { timeSlotId: slot.id } });
    expect(bookings.map((b) => b.name)).toEqual(['Visitor 2']);
    expect(await invariantViolations()).toBe(0);
  });

  it('a delete that waited for a competing booking to commit gets 409 and deletes nothing', async () => {
    const slot = await insertSlot(june(3, '10:00'));

    await holder.query('BEGIN');
    await holder.query(`UPDATE time_slots SET status = 'BOOKED' WHERE id = $1`, [slot.id]);
    await holder.query(
      `INSERT INTO bookings (time_slot_id, name, email, confirmation_token) VALUES ($1, 'First', 'first@example.com', $2)`,
      [slot.id, randomToken()],
    );

    const pending = request(app).delete(`/api/slots/${slot.id}`).then((r) => r);
    await waitForBlockedSession(observer);
    await holder.query('COMMIT');
    const res = await pending;

    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_HAS_BOOKING');
    expect(await prisma.timeSlot.count()).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
    expect(await invariantViolations()).toBe(0);
  });
});

describe('booking vs. delete races', () => {
  it('never leaves a booking without its slot or a BOOKED slot without a booking', async () => {
    const outcomes = new Set<string>();

    for (let round = 0; round < 10; round += 1) {
      const slot = await insertSlot(june(3 + (round % 20), '10:00'));
      const [del, booking] = await Promise.all([
        request(app).delete(`/api/slots/${slot.id}`),
        book(slot.id, round),
      ]);
      const outcome = `${del.status}/${booking.status}`;
      outcomes.add(outcome);

      // Either the delete won (slot gone, booking 404) or the booking won (delete 409).
      expect(['204/404', '409/201']).toContain(outcome);
      const remaining = await prisma.timeSlot.findUnique({ where: { id: slot.id }, include: { booking: true } });
      if (outcome === '204/404') {
        expect(remaining).toBeNull();
      } else {
        expect(remaining?.status).toBe('BOOKED');
        expect(remaining?.booking).not.toBeNull();
      }
      expect(await invariantViolations()).toBe(0);
    }
    // Informational: which orderings actually occurred.
    expect(outcomes.size).toBeGreaterThan(0);
  });
});
