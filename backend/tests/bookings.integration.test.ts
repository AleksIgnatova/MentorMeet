/**
 * Bookings API end to end against the `mentormeet_test` database.
 * Race conditions are covered in bookings-concurrency.integration.test.ts.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { BookingConfirmationDto, CreatedBookingDto, HostBookingDto } from '../src/modules/bookings/bookings.types';
import { randomToken, resetDatabase } from './db-helpers';
import { buildApp, testConfig, testPrisma } from './helpers';

const Y = new Date().getUTCFullYear() + 2;
const june = (day: number, time: string) => `${Y}-06-${String(day).padStart(2, '0')}T${time}:00+02:00`;

type ErrorBody = { error: { code: string; message: string } };

const prisma = testPrisma();
const app = buildApp(testConfig(), { bookingRateLimit: { windowMs: 60_000, limit: 1000 } });

const insertSlot = (
  start: string,
  minutes = 30,
  status: 'AVAILABLE' | 'BOOKED' | 'CANCELLED' = 'AVAILABLE',
) =>
  prisma.timeSlot.create({
    data: {
      startTime: new Date(start),
      endTime: new Date(new Date(start).getTime() + minutes * 60_000),
      status,
    },
  });

const book = (timeSlotId: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/bookings')
    .send({ timeSlotId, name: 'Ana Petrova', email: 'ana@example.com', ...overrides });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/bookings', () => {
  it('books an available slot and returns the confirmation data with a token', async () => {
    const slot = await insertSlot(june(3, '14:00'), 45);

    const res = await book(slot.id, { name: '  Ana Petrova  ' });

    expect(res.status).toBe(201);
    const { data } = res.body as { data: CreatedBookingDto };
    expect(data).toEqual({
      name: 'Ana Petrova',
      status: 'CONFIRMED',
      slot: {
        startTime: `${Y}-06-03T12:00:00.000Z`,
        endTime: `${Y}-06-03T12:45:00.000Z`,
        durationMinutes: 45,
      },
      confirmationToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
    });
    // Only what the visitor needs: no email echo, no internal id.
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('id');

    const stored = await prisma.booking.findUniqueOrThrow({ where: { timeSlotId: slot.id } });
    expect(stored).toMatchObject({
      name: 'Ana Petrova',
      email: 'ana@example.com',
      status: 'CONFIRMED',
      confirmationToken: data.confirmationToken,
    });
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('BOOKED');
  });

  it('makes the slot unavailable everywhere afterwards', async () => {
    const slot = await insertSlot(june(3, '10:00'));
    await book(slot.id).expect(201);

    const single = await request(app).get(`/api/slots/${slot.id}`);
    expect((single.body as { data: { status: string } }).data.status).toBe('BOOKED');

    const available = await request(app)
      .get('/api/slots')
      .query({ from: `${Y}-06-03`, to: `${Y}-06-03`, status: 'AVAILABLE' });
    expect(available.body).toEqual({ data: [] });

    const del = await request(app).delete(`/api/slots/${slot.id}`);
    expect(del.status).toBe(409);
    expect((del.body as ErrorBody).error.code).toBe('SLOT_HAS_BOOKING');
  });

  it('gives every booking a different token', async () => {
    const slots = await Promise.all([1, 2, 3].map((d) => insertSlot(june(d, '10:00'))));
    const tokens = await Promise.all(
      slots.map(async (s) => ((await book(s.id)).body as { data: CreatedBookingDto }).data.confirmationToken),
    );
    expect(new Set(tokens).size).toBe(3);
  });

  it('returns 409 SLOT_ALREADY_BOOKED for a slot that is already booked', async () => {
    const slot = await insertSlot(june(3, '10:00'));
    await book(slot.id).expect(201);

    const res = await book(slot.id, { name: 'Marko', email: 'marko@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'SLOT_ALREADY_BOOKED', message: 'This time slot is no longer available.' },
    });
    expect(await prisma.booking.count()).toBe(1);
  });

  it('refuses a slot marked BOOKED even when no booking row exists (status check, not only the UNIQUE constraint)', async () => {
    // The UNIQUE(time_slot_id) backstop cannot help here, so this isolates the
    // conditional `UPDATE ... WHERE status = 'AVAILABLE'`.
    const slot = await insertSlot(june(3, '10:00'), 30, 'BOOKED');
    const res = await book(slot.id);
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_ALREADY_BOOKED');
    expect(await prisma.booking.count()).toBe(0);
  });

  it('returns 404 SLOT_NOT_FOUND for a non-existent slot', async () => {
    const res = await book(randomUUID());
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_FOUND');
    expect(await prisma.booking.count()).toBe(0);
  });

  it('returns 409 SLOT_NOT_AVAILABLE for a slot that has already started', async () => {
    const slot = await insertSlot('2020-01-01T10:00:00+01:00');
    const res = await book(slot.id);
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_AVAILABLE');
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('AVAILABLE');
  });

  it('uses the server clock: a slot starting exactly now cannot be booked', async () => {
    const slot = await insertSlot(june(3, '10:00'));
    const clocked = buildApp(testConfig(), { now: () => new Date(june(3, '10:00')) });
    const res = await request(clocked)
      .post('/api/bookings')
      .send({ timeSlotId: slot.id, name: 'Ana', email: 'ana@example.com' });
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('returns 409 SLOT_NOT_AVAILABLE for a cancelled slot', async () => {
    const slot = await insertSlot(june(3, '10:00'), 30, 'CANCELLED');
    const res = await book(slot.id);
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it.each([
    ['invalid email', { email: 'not-an-email' }],
    ['blank name', { name: '  ' }],
    ['name too long', { name: 'x'.repeat(101) }],
    ['client-supplied status', { status: 'CONFIRMED' }],
    ['client-supplied startTime', { startTime: june(4, '10:00') }],
    ['client-supplied endTime', { endTime: june(4, '10:30') }],
  ])('returns 400 VALIDATION_ERROR for %s and changes nothing', async (_label, override) => {
    const slot = await insertSlot(june(3, '10:00'));
    const res = await book(slot.id, override);
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.booking.count()).toBe(0);
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('AVAILABLE');
  });

  it('returns 400 VALIDATION_ERROR for a malformed slot id', async () => {
    const res = await book('slot-1');
    expect(res.status).toBe(400);
  });

  it('rolls back the slot update when inserting the booking fails', async () => {
    // A colliding token makes the INSERT fail after the slot UPDATE succeeded.
    const fixedToken = randomToken();
    const collidingApp = buildApp(testConfig({ nodeEnv: 'production' }), {
      generateToken: () => fixedToken,
    });
    const first = await insertSlot(june(3, '10:00'));
    const second = await insertSlot(june(3, '11:00'));
    await request(collidingApp)
      .post('/api/bookings')
      .send({ timeSlotId: first.id, name: 'Ana', email: 'ana@example.com' })
      .expect(201);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(collidingApp)
      .post('/api/bookings')
      .send({ timeSlotId: second.id, name: 'Marko Markovski', email: 'marko@example.com' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    // The UPDATE to BOOKED was rolled back together with the failed INSERT.
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('AVAILABLE');
    expect(await prisma.booking.count()).toBe(1);
    // The failure is logged without personal data or the token.
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('marko@example.com');
    expect(logged).not.toContain('Marko Markovski');
    expect(logged).not.toContain(fixedToken);
  });

  it('falls back on the UNIQUE(time_slot_id) constraint if a booking already exists for an AVAILABLE slot', async () => {
    // Inconsistent state the transaction normally prevents: the constraint still blocks a second booking.
    const slot = await insertSlot(june(3, '10:00'));
    await prisma.booking.create({
      data: { timeSlotId: slot.id, name: 'Ana', email: 'ana@example.com', confirmationToken: randomToken() },
    });

    const res = await book(slot.id, { email: 'marko@example.com' });
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_ALREADY_BOOKED');
    expect(await prisma.booking.count()).toBe(1);
    // The UPDATE inside the failed transaction was rolled back.
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('AVAILABLE');
  });

  it('applies a stricter rate limit to booking creation only', async () => {
    const limited = buildApp(testConfig(), { bookingRateLimit: { windowMs: 60_000, limit: 2 } });
    const slots = await Promise.all([1, 2, 3].map((d) => insertSlot(june(d, '10:00'))));
    const post = (id: string) =>
      request(limited).post('/api/bookings').send({ timeSlotId: id, name: 'Ana', email: 'ana@example.com' });

    await post(slots[0]!.id).expect(201);
    await post(slots[1]!.id).expect(201);
    const third = await post(slots[2]!.id);
    expect(third.status).toBe(429);
    expect((third.body as ErrorBody).error.code).toBe('RATE_LIMITED');
    expect((await prisma.timeSlot.findUniqueOrThrow({ where: { id: slots[2]!.id } })).status).toBe('AVAILABLE');

    // Reading is not affected by the booking limiter.
    await request(limited).get('/api/bookings').expect(200);
  });
});

describe('GET /api/bookings/:token', () => {
  it('returns only what the confirmation page needs, every time it is requested', async () => {
    const slot = await insertSlot(june(3, '14:00'), 60);
    const { confirmationToken } = ((await book(slot.id)).body as { data: CreatedBookingDto }).data;

    for (let i = 0; i < 2; i += 1) {
      // Simulates a browser refresh: the data comes from the database each time.
      const res = await request(app).get(`/api/bookings/${confirmationToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        data: {
          name: 'Ana Petrova',
          status: 'CONFIRMED',
          slot: {
            startTime: `${Y}-06-03T12:00:00.000Z`,
            endTime: `${Y}-06-03T13:00:00.000Z`,
            durationMinutes: 60,
          },
        } satisfies BookingConfirmationDto,
      });
    }
  });

  it.each([
    ['unknown well-formed token', () => randomToken()],
    ['malformed token', () => 'not-a-token'],
    ['token with SQL', () => "x' OR '1'='1"],
  ])('returns 404 BOOKING_NOT_FOUND for an %s', async (_label, token) => {
    const res = await request(app).get(`/api/bookings/${encodeURIComponent(token())}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
  });

  it('cannot be accessed with the booking id instead of the token', async () => {
    const slot = await insertSlot(june(3, '10:00'));
    await book(slot.id).expect(201);
    const { id } = await prisma.booking.findUniqueOrThrow({ where: { timeSlotId: slot.id } });

    await request(app).get(`/api/bookings/${id}`).expect(404);
  });
});

describe('GET /api/bookings (host dashboard)', () => {
  it('lists bookings ordered by session start, with contact details but no tokens', async () => {
    const later = await insertSlot(june(5, '10:00'));
    const earlier = await insertSlot(june(4, '10:00'));
    await book(later.id, { name: 'Later', email: 'later@example.com' }).expect(201);
    await book(earlier.id, { name: 'Earlier', email: 'earlier@example.com' }).expect(201);

    const res = await request(app).get('/api/bookings');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { data } = res.body as { data: HostBookingDto[] };
    expect(data.map((b) => b.name)).toEqual(['Earlier', 'Later']);
    expect(data[0]).toEqual({
      id: expect.any(String) as string,
      name: 'Earlier',
      email: 'earlier@example.com',
      status: 'CONFIRMED',
      createdAt: expect.any(String) as string,
      slot: {
        id: earlier.id,
        startTime: `${Y}-06-04T08:00:00.000Z`,
        endTime: `${Y}-06-04T08:30:00.000Z`,
        durationMinutes: 30,
        status: 'BOOKED',
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/confirmationToken/);
  });

  it('with upcoming=true returns only bookings whose session has not ended', async () => {
    const past = await insertSlot(june(3, '09:00'));
    const ongoing = await insertSlot(june(3, '11:45'));
    const future = await insertSlot(june(3, '15:00'));
    for (const slot of [past, ongoing, future]) {
      await book(slot.id).expect(201);
    }

    const clocked = buildApp(testConfig(), { now: () => new Date(june(3, '12:00')) });
    const all = await request(clocked).get('/api/bookings');
    expect((all.body as { data: HostBookingDto[] }).data).toHaveLength(3);

    const upcoming = await request(clocked).get('/api/bookings').query({ upcoming: 'true' });
    expect((upcoming.body as { data: HostBookingDto[] }).data.map((b) => b.slot.id)).toEqual([
      ongoing.id,
      future.id,
    ]);
  });

  it('returns an empty list when there are no bookings', async () => {
    expect((await request(app).get('/api/bookings')).body).toEqual({ data: [] });
  });

  it('returns 400 for an invalid upcoming flag', async () => {
    const res = await request(app).get('/api/bookings').query({ upcoming: 'yes' });
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});
