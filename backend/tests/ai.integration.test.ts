/**
 * POST /api/ai/confirmation end to end against the `mentormeet_test` database,
 * including persistence of the generated message and concurrent requests.
 * The AI provider is always a test double: no real Gemini call is ever made.
 */
import request from 'supertest';
import type { ConfirmationMessageDto } from '../src/modules/ai/ai.service';
import { AiProviderError, type TextGenerator } from '../src/modules/ai/gemini.client';
import type { CreatedBookingDto } from '../src/modules/bookings/bookings.types';
import { randomToken, resetDatabase } from './db-helpers';
import { buildApp, testConfig, testPrisma } from './helpers';

const Y = new Date().getUTCFullYear() + 2;
const prisma = testPrisma();
const relaxed = { windowMs: 60_000, limit: 1000 };

type ErrorBody = { error: { code: string; message: string } };
type App = ReturnType<typeof buildApp>;
type GenerateMock = jest.Mock<ReturnType<TextGenerator>, Parameters<TextGenerator>>;

function appWith(generateText: TextGenerator | undefined, extra: Parameters<typeof buildApp>[1] = {}): App {
  return buildApp(testConfig(), {
    bookingRateLimit: relaxed,
    aiRateLimit: relaxed,
    aiRetryDelayMs: 0,
    generateText,
    ...extra,
  });
}

/** Resolves with `text` after `ms`, like a provider that takes a while. */
const slowProvider = (text: string, ms = 150): GenerateMock =>
  jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>(() => new Promise<string>((resolve) => setTimeout(() => resolve(text), ms)));

async function createBooking(app: App): Promise<CreatedBookingDto> {
  const start = new Date(`${Y}-06-03T14:00:00+02:00`);
  const slot = await prisma.timeSlot.create({
    data: { startTime: start, endTime: new Date(start.getTime() + 45 * 60_000) },
  });
  const res = await request(app)
    .post('/api/bookings')
    .send({ timeSlotId: slot.id, name: 'Ana Petrova', email: 'ana@example.com' });
  expect(res.status).toBe(201);
  return (res.body as { data: CreatedBookingDto }).data;
}

const askForMessage = (app: App, body: unknown) => request(app).post('/api/ai/confirmation').send(body as object);

async function messageFor(app: App, token: string): Promise<ConfirmationMessageDto> {
  const res = await askForMessage(app, { token });
  expect(res.status).toBe(200);
  return (res.body as { data: ConfirmationMessageDto }).data;
}

const storedMessage = async (token: string) =>
  (await prisma.booking.findUniqueOrThrow({ where: { confirmationToken: token } })).aiConfirmationMessage;

beforeEach(async () => {
  await resetDatabase(prisma);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/ai/confirmation', () => {
  it('returns the fallback message when GEMINI_API_KEY is not set (default test config), and stores nothing', async () => {
    const app = buildApp(testConfig(), { bookingRateLimit: relaxed, aiRateLimit: relaxed });
    const booking = await createBooking(app);

    const res = await askForMessage(app, { token: booking.confirmationToken });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { data } = res.body as { data: ConfirmationMessageDto };
    expect(data.source).toBe('fallback');
    expect(data.message).toContain('Thank you, Ana Petrova!');
    expect(await storedMessage(booking.confirmationToken)).toBeNull();
  });

  it('builds the AI message from the stored booking, without sending the email or token', async () => {
    const generateText: GenerateMock = jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>(() => Promise.resolve('Thank you, Ana! Your 45-minute session is booked.'));
    const app = appWith(generateText);
    const booking = await createBooking(app);

    expect(await messageFor(app, booking.confirmationToken)).toEqual({
      message: 'Thank you, Ana! Your 45-minute session is booked.',
      source: 'ai',
    });
    const [{ system, prompt }] = generateText.mock.calls[0]!;
    expect(prompt).toContain('Ana Petrova');
    expect(prompt).toContain('14:00–14:45 (Europe/Skopje)');
    expect(`${system}\n${prompt}`).not.toContain('ana@example.com');
    expect(`${system}\n${prompt}`).not.toContain(booking.confirmationToken);
  });

  describe('persistence', () => {
    it('stores the AI message and returns it on later requests (refreshes) without calling the provider again', async () => {
      const generateText: GenerateMock = jest
        .fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>()
        .mockResolvedValueOnce('  Thank you, Ana!  ')
        .mockResolvedValue('A different message that must never be shown.');
      const app = appWith(generateText);
      const booking = await createBooking(app);

      const first = await messageFor(app, booking.confirmationToken);
      expect(first).toEqual({ message: 'Thank you, Ana!', source: 'ai' });
      expect(await storedMessage(booking.confirmationToken)).toBe('Thank you, Ana!');

      for (let refresh = 0; refresh < 3; refresh += 1) {
        expect(await messageFor(app, booking.confirmationToken)).toEqual(first);
      }
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('serves a stored message even when no provider is configured any more (e.g. after a restart without a key)', async () => {
      const booking = await createBooking(appWith(undefined));
      await messageFor(appWith(() => Promise.resolve('Stored once, Ana.')), booking.confirmationToken);

      expect(await messageFor(appWith(undefined), booking.confirmationToken)).toEqual({
        message: 'Stored once, Ana.',
        source: 'ai',
      });
    });

    it('does not store a fallback, so a later request can still get an AI message', async () => {
      const generateText: GenerateMock = jest
        .fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>()
        .mockRejectedValueOnce(new AiProviderError('http_error', 403)) // Permanent: no retry.
        .mockResolvedValueOnce('Thank you, Ana! It worked this time.');
      const app = appWith(generateText);
      const booking = await createBooking(app);

      expect((await messageFor(app, booking.confirmationToken)).source).toBe('fallback');
      expect(await storedMessage(booking.confirmationToken)).toBeNull();

      expect(await messageFor(app, booking.confirmationToken)).toEqual({
        message: 'Thank you, Ana! It worked this time.',
        source: 'ai',
      });
      expect(await storedMessage(booking.confirmationToken)).toBe('Thank you, Ana! It worked this time.');
      expect(generateText).toHaveBeenCalledTimes(2);
    });

    it('retries a transient provider failure once within the same request and stores the result', async () => {
      const generateText: GenerateMock = jest
        .fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>()
        .mockRejectedValueOnce(new AiProviderError('http_error', 503))
        .mockResolvedValueOnce('Thank you, Ana! Second attempt.');
      const app = appWith(generateText);
      const booking = await createBooking(app);

      expect(await messageFor(app, booking.confirmationToken)).toEqual({
        message: 'Thank you, Ana! Second attempt.',
        source: 'ai',
      });
      expect(generateText).toHaveBeenCalledTimes(2);
      expect(await storedMessage(booking.confirmationToken)).toBe('Thank you, Ana! Second attempt.');
    });

    it('does not generate or store a message for a cancelled booking', async () => {
      const generateText: GenerateMock = jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>();
      const app = appWith(generateText);
      const booking = await createBooking(app);
      await prisma.booking.update({
        where: { confirmationToken: booking.confirmationToken },
        data: { status: 'CANCELLED' },
      });

      const data = await messageFor(app, booking.confirmationToken);
      expect(data.source).toBe('fallback');
      expect(data.message).toContain('cancelled');
      expect(generateText).not.toHaveBeenCalled();
      expect(await storedMessage(booking.confirmationToken)).toBeNull();
    });
  });

  describe('concurrent requests for the same booking', () => {
    it('share one provider call within a server (e.g. React StrictMode double requests)', async () => {
      const generateText = slowProvider('Thank you, Ana! Shared message.');
      const app = appWith(generateText);
      const booking = await createBooking(app);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => messageFor(app, booking.confirmationToken)),
      );

      expect(generateText).toHaveBeenCalledTimes(1);
      for (const result of results) {
        expect(result).toEqual({ message: 'Thank you, Ana! Shared message.', source: 'ai' });
      }
      expect(await storedMessage(booking.confirmationToken)).toBe('Thank you, Ana! Shared message.');
    });

    it('store exactly one message across servers, and every response returns that stored message', async () => {
      // Separate app instances do not share in-flight work, like separate server processes.
      // A barrier makes the race deterministic: no provider answers until all three
      // have been called, so all three servers try to store a message.
      const texts = ['Message from server A.', 'Message from server B.', 'Message from server C.'];
      let arrived = 0;
      let releaseAll!: () => void;
      const allArrived = new Promise<void>((resolve) => (releaseAll = resolve));
      const providers: GenerateMock[] = texts.map((text) =>
        jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>(async () => {
          arrived += 1;
          if (arrived === texts.length) releaseAll();
          await allArrived;
          return text;
        }),
      );
      const apps = providers.map((generateText) => appWith(generateText));
      const booking = await createBooking(apps[0]!);

      const results = await Promise.all(apps.map((app) => messageFor(app, booking.confirmationToken)));

      for (const generateText of providers) expect(generateText).toHaveBeenCalledTimes(1);
      const stored = await storedMessage(booking.confirmationToken);
      expect(texts).toContain(stored);
      for (const result of results) expect(result).toEqual({ message: stored, source: 'ai' });

      // The booking itself is untouched.
      const row = await prisma.booking.findUniqueOrThrow({
        where: { confirmationToken: booking.confirmationToken },
        include: { timeSlot: true },
      });
      expect(row.status).toBe('CONFIRMED');
      expect(row.timeSlot.status).toBe('BOOKED');
      expect(await prisma.booking.count()).toBe(1);
    });
  });

  it('keeps the booking intact and returns 200 with the fallback when the provider keeps failing', async () => {
    const generateText: GenerateMock = jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>(() => Promise.reject(new AiProviderError('http_error', 503)));
    const app = appWith(generateText);
    const booking = await createBooking(app);
    const warn = jest.mocked(console.warn);

    const res = await askForMessage(app, { token: booking.confirmationToken });

    expect(res.status).toBe(200);
    expect((res.body as { data: ConfirmationMessageDto }).data.source).toBe('fallback');
    expect(generateText).toHaveBeenCalledTimes(2); // The first attempt and one retry.
    const logged = warn.mock.calls.map((args) => String(args[0])).join('\n');
    expect(logged).toContain('retrying once');
    expect(logged).toContain('using the fallback message');
    expect(logged).not.toContain(booking.confirmationToken);
    expect(logged).not.toContain('Ana');

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { confirmationToken: booking.confirmationToken },
      include: { timeSlot: true },
    });
    expect(stored.status).toBe('CONFIRMED');
    expect(stored.timeSlot.status).toBe('BOOKED');
    expect(stored.aiConfirmationMessage).toBeNull();
    expect(await prisma.booking.count()).toBe(1);
  });

  it('returns the fallback when the provider times out, and stores nothing', async () => {
    const app = appWith(() => new Promise<string>(() => undefined), { aiTimeoutMs: 50 });
    const booking = await createBooking(app);

    const res = await askForMessage(app, { token: booking.confirmationToken });

    expect(res.status).toBe(200);
    expect((res.body as { data: ConfirmationMessageDto }).data.source).toBe('fallback');
    expect(await storedMessage(booking.confirmationToken)).toBeNull();
  });

  it.each([
    ['an unknown token', () => randomToken()],
    ['a malformed token', () => 'not-a-real-token'],
  ])('returns 404 BOOKING_NOT_FOUND for %s without calling the provider', async (_label, token) => {
    const generateText: GenerateMock = jest.fn<ReturnType<TextGenerator>, Parameters<TextGenerator>>();
    const res = await askForMessage(appWith(generateText), { token: token() });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error.code).toBe('BOOKING_NOT_FOUND');
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing token', {}],
    ['a non-string token', { token: 42 }],
    ['client-supplied message details', { token: randomToken(), name: 'Mallory' }],
    ['an over-long token', { token: 'a'.repeat(101) }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body) => {
    const res = await askForMessage(appWith(undefined), body);
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('is rate limited separately', async () => {
    const app = appWith(undefined, { aiRateLimit: { windowMs: 60_000, limit: 2 } });
    const booking = await createBooking(app);

    for (let i = 0; i < 2; i += 1) {
      expect((await askForMessage(app, { token: booking.confirmationToken })).status).toBe(200);
    }
    const limited = await askForMessage(app, { token: booking.confirmationToken });
    expect(limited.status).toBe(429);
    expect((limited.body as ErrorBody).error.code).toBe('RATE_LIMITED');
  });
});
