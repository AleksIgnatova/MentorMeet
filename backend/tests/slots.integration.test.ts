/**
 * Slots API end to end: HTTP -> Express -> service -> Prisma -> PostgreSQL
 * (the `mentormeet_test` database).
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { SlotDto } from '../src/modules/slots/slots.types';
import { randomToken, resetDatabase } from './db-helpers';
import { buildApp, testConfig, testPrisma } from './helpers';

/** A year safely in the future, so the tests never go stale. */
const Y = new Date().getUTCFullYear() + 2;
/** Skopje is UTC+2 in June (summer time). */
const june = (day: number, time: string) => `${Y}-06-${String(day).padStart(2, '0')}T${time}:00+02:00`;

type SlotBody = { data: SlotDto };
type SlotListBody = { data: SlotDto[] };
type ErrorBody = { error: { code: string; message: string; details?: { path: string }[] } };

const prisma = testPrisma();
const app = buildApp();

const createSlot = (startTime: string, durationMinutes: number = 30) =>
  request(app).post('/api/slots').send({ startTime, durationMinutes });

/** Inserts directly, bypassing the API (e.g. for past slots the API would reject). */
const insertSlot = (start: Date, minutes: number, status: 'AVAILABLE' | 'BOOKED' = 'AVAILABLE') =>
  prisma.timeSlot.create({
    data: { startTime: start, endTime: new Date(start.getTime() + minutes * 60_000), status },
  });

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/slots', () => {
  it('creates a slot, computing endTime on the server', async () => {
    const res = await createSlot(june(3, '14:00'), 45);

    expect(res.status).toBe(201);
    const { data } = res.body as SlotBody;
    expect(data).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      startTime: `${Y}-06-03T12:00:00.000Z`,
      endTime: `${Y}-06-03T12:45:00.000Z`,
      durationMinutes: 45,
      status: 'AVAILABLE',
    });
    expect(res.headers.location).toBe(`/api/slots/${data.id}`);

    const stored = await prisma.timeSlot.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.endTime.toISOString()).toBe(`${Y}-06-03T12:45:00.000Z`);
  });

  it.each([15, 30, 45, 60])('accepts a %i-minute slot', async (minutes) => {
    const res = await createSlot(june(3, '10:00'), minutes);
    expect(res.status).toBe(201);
    expect((res.body as SlotBody).data.durationMinutes).toBe(minutes);
  });

  it('treats equivalent offsets as the same instant', async () => {
    const res = await createSlot(`${Y}-06-03T12:00:00Z`);
    expect((res.body as SlotBody).data.startTime).toBe(`${Y}-06-03T12:00:00.000Z`);
    // 14:00+02:00 is the same instant -> overlaps.
    const again = await createSlot(june(3, '14:00'));
    expect(again.status).toBe(409);
  });

  it.each([
    ['unsupported duration', { startTime: june(3, '10:00'), durationMinutes: 20 }],
    ['duration as string', { startTime: june(3, '10:00'), durationMinutes: '30' }],
    ['missing duration', { startTime: june(3, '10:00') }],
    ['start time without zone', { startTime: `${Y}-06-03T10:00:00`, durationMinutes: 30 }],
    ['non-existent date', { startTime: `${Y}-02-30T10:00:00+01:00`, durationMinutes: 30 }],
    ['client-supplied endTime', { startTime: june(3, '10:00'), durationMinutes: 30, endTime: june(3, '12:00') }],
    ['client-supplied status', { startTime: june(3, '10:00'), durationMinutes: 30, status: 'BOOKED' }],
  ])('returns 400 VALIDATION_ERROR for %s', async (_label, body) => {
    const res = await request(app).post('/api/slots').send(body);
    expect(res.status).toBe(400);
    const { error } = res.body as ErrorBody;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.length).toBeGreaterThan(0);
    expect(await prisma.timeSlot.count()).toBe(0);
  });

  it('returns 400 VALIDATION_ERROR when there is no JSON body', async () => {
    const res = await request(app).post('/api/slots');
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a slot in the past with 400 SLOT_IN_PAST', async () => {
    const res = await createSlot('2020-01-01T10:00:00+01:00');
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_IN_PAST');
    expect(await prisma.timeSlot.count()).toBe(0);
  });

  it('treats "now" as the past and one minute later as the future', async () => {
    const now = new Date(june(3, '10:00'));
    const clockedApp = buildApp(testConfig(), { now: () => now });

    const atNow = await request(clockedApp)
      .post('/api/slots')
      .send({ startTime: june(3, '10:00'), durationMinutes: 30 });
    expect(atNow.status).toBe(400);
    expect((atNow.body as ErrorBody).error.code).toBe('SLOT_IN_PAST');

    const later = await request(clockedApp)
      .post('/api/slots')
      .send({ startTime: june(3, '10:01'), durationMinutes: 30 });
    expect(later.status).toBe(201);
  });

  it.each([
    ['same interval', '10:00', 30],
    ['starts inside', '10:15', 30],
    ['ends inside', '09:45', 30],
    ['contains it', '09:30', 60],
    ['inside it', '10:10', 15],
  ])('returns 409 SLOT_OVERLAP for an overlapping slot (%s)', async (_label, time, minutes) => {
    await createSlot(june(3, '10:00'), 30).expect(201);

    const res = await createSlot(june(3, time), minutes);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'SLOT_OVERLAP', message: 'This time slot overlaps an existing time slot.' },
    });
    expect(await prisma.timeSlot.count()).toBe(1);
  });

  it('allows adjacent slots (half-open intervals)', async () => {
    await createSlot(june(3, '10:00'), 30).expect(201);
    await createSlot(june(3, '10:30'), 30).expect(201);
    await createSlot(june(3, '09:30'), 30).expect(201);
    expect(await prisma.timeSlot.count()).toBe(3);
  });

  it('lets exactly one of several concurrent overlapping requests succeed', async () => {
    const times = ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'];
    const responses = await Promise.all(times.map((time) => createSlot(june(3, time), 30)));

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    for (const r of responses.filter((r) => r.status === 409)) {
      expect((r.body as ErrorBody).error.code).toBe('SLOT_OVERLAP');
    }
    expect(await prisma.timeSlot.count()).toBe(1);
  });
});

describe('GET /api/slots', () => {
  const list = (query: Record<string, string>) => request(app).get('/api/slots').query(query);

  it('returns slots whose start falls on the requested Skopje calendar days, ordered by start', async () => {
    const ids = {
      // 23:30 Skopje on 1 June = 21:30 UTC: before the range.
      before: (await insertSlot(new Date(june(1, '23:30')), 30)).id,
      // 00:00 Skopje on 2 June = 22:00 UTC on 1 June: first instant of the range.
      first: (await insertSlot(new Date(june(2, '00:00')), 30)).id,
      middle: (await insertSlot(new Date(june(3, '12:00')), 30)).id,
      // 23:30 Skopje on 4 June: last slot of the range (inclusive `to`).
      last: (await insertSlot(new Date(june(4, '23:30')), 30)).id,
      // 00:00 Skopje on 5 June: after the range.
      after: (await insertSlot(new Date(june(5, '00:00')), 30)).id,
    };

    const res = await list({ from: `${Y}-06-02`, to: `${Y}-06-04` });

    expect(res.status).toBe(200);
    const { data } = res.body as SlotListBody;
    expect(data.map((s) => s.id)).toEqual([ids.first, ids.middle, ids.last]);
  });

  it('returns an empty list when there are no slots', async () => {
    const res = await list({ from: `${Y}-06-01`, to: `${Y}-06-30` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('covers the whole 25-hour day when summer time ends', async () => {
    // Last Sunday of October: clocks go back 03:00 -> 02:00 in Europe/Skopje,
    // so the day runs from 00:00 CEST (+02:00) to 24:00 CET (+01:00).
    const lastSunday = new Date(Date.UTC(Y, 9, 31));
    lastSunday.setUTCDate(31 - lastSunday.getUTCDay());
    const day = lastSunday.toISOString().slice(0, 10);
    const nextDay = new Date(lastSunday.getTime() + 86_400_000).toISOString().slice(0, 10);
    const previousDay = new Date(lastSunday.getTime() - 86_400_000).toISOString().slice(0, 10);

    await insertSlot(new Date(`${previousDay}T23:45:00+02:00`), 15); // excluded
    const first = await insertSlot(new Date(`${day}T00:00:00+02:00`), 15); // included (CEST)
    const last = await insertSlot(new Date(`${day}T23:45:00+01:00`), 15); // included (CET)
    await insertSlot(new Date(`${nextDay}T00:00:00+01:00`), 15); // excluded

    const res = await list({ from: day, to: day });
    expect(res.status).toBe(200);
    expect((res.body as SlotListBody).data.map((s) => s.id)).toEqual([first.id, last.id]);
  });

  it('with status=AVAILABLE returns only available slots that have not started yet', async () => {
    const now = new Date(june(3, '12:00'));
    const clockedApp = buildApp(testConfig(), { now: () => now });

    const startedEarlier = await insertSlot(new Date(june(3, '09:00')), 30);
    const booked = await insertSlot(new Date(june(3, '13:00')), 30, 'BOOKED');
    const bookable = await insertSlot(new Date(june(3, '15:00')), 30);

    const all = await request(clockedApp).get('/api/slots').query({ from: `${Y}-06-03`, to: `${Y}-06-03` });
    expect((all.body as SlotListBody).data.map((s) => s.id)).toEqual([
      startedEarlier.id,
      booked.id,
      bookable.id,
    ]);

    const available = await request(clockedApp)
      .get('/api/slots')
      .query({ from: `${Y}-06-03`, to: `${Y}-06-03`, status: 'AVAILABLE' });
    expect(available.status).toBe(200);
    expect((available.body as SlotListBody).data.map((s) => s.id)).toEqual([bookable.id]);
  });

  it.each([
    ['missing parameters', {}],
    ['to before from', { from: `${Y}-06-10`, to: `${Y}-06-01` }],
    ['range longer than 93 days', { from: `${Y}-01-01`, to: `${Y}-12-31` }],
    ['invalid date', { from: `${Y}-06-31`, to: `${Y}-07-01` }],
    ['unsupported status', { from: `${Y}-06-01`, to: `${Y}-06-02`, status: 'BOOKED' }],
  ])('returns 400 VALIDATION_ERROR for %s', async (_label, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/slots/:id', () => {
  it('returns the slot', async () => {
    const slot = await insertSlot(new Date(june(3, '10:00')), 60);
    const res = await request(app).get(`/api/slots/${slot.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: slot.id,
        startTime: `${Y}-06-03T08:00:00.000Z`,
        endTime: `${Y}-06-03T09:00:00.000Z`,
        durationMinutes: 60,
        status: 'AVAILABLE',
      },
    });
  });

  it('returns 404 SLOT_NOT_FOUND for an unknown id', async () => {
    const res = await request(app).get(`/api/slots/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a malformed id', async () => {
    const res = await request(app).get('/api/slots/not-a-uuid');
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/slots/:id', () => {
  it('deletes an available slot (204) and frees its time', async () => {
    const created = (await createSlot(june(3, '10:00')).expect(201)).body as SlotBody;

    const res = await request(app).delete(`/api/slots/${created.data.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await prisma.timeSlot.count()).toBe(0);

    await request(app).get(`/api/slots/${created.data.id}`).expect(404);
    await createSlot(june(3, '10:00')).expect(201);
  });

  it('returns 404 SLOT_NOT_FOUND for an unknown or already deleted slot', async () => {
    const res = await request(app).delete(`/api/slots/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a malformed id', async () => {
    await request(app).delete('/api/slots/123').expect(400);
  });

  it('refuses to delete a booked slot with 409 SLOT_HAS_BOOKING', async () => {
    const slot = await insertSlot(new Date(june(3, '10:00')), 30, 'BOOKED');
    await prisma.booking.create({
      data: { timeSlotId: slot.id, name: 'Ana', email: 'ana@example.com', confirmationToken: randomToken() },
    });

    const res = await request(app).delete(`/api/slots/${slot.id}`);
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_HAS_BOOKING');
    expect(await prisma.timeSlot.count()).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('relies on the foreign key if a booking exists while the slot is still AVAILABLE', async () => {
    // Inconsistent state that the Phase 4 transaction prevents; the FK is the backstop.
    const slot = await insertSlot(new Date(june(3, '10:00')), 30, 'AVAILABLE');
    await prisma.booking.create({
      data: { timeSlotId: slot.id, name: 'Ana', email: 'ana@example.com', confirmationToken: randomToken() },
    });

    const res = await request(app).delete(`/api/slots/${slot.id}`);
    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error.code).toBe('SLOT_HAS_BOOKING');
    expect(JSON.stringify(res.body)).not.toContain('ana@example.com');
    expect(await prisma.timeSlot.count()).toBe(1);
  });
});
