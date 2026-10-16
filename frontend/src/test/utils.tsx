import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/router';
import type { BookingConfirmation, HostBooking } from '../types/booking';
import type { Slot } from '../types/slot';

export type MockRequest = { method: string; url: URL; body: unknown };
export type MockResponse = { status: number; body?: unknown };
type Handler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

/**
 * Replaces global fetch. Every request goes to `handler`; the returned mock
 * records calls so tests can assert on method, URL, query and JSON body.
 */
export function mockFetch(handler: Handler) {
  const requests: MockRequest[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: MockRequest = {
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : String(input)),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    requests.push(request);
    const { status, body } = await handler(request);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, requests };
}

export const ok = (data: unknown, status = 200): MockResponse => ({ status, body: { data } });
export const apiError = (status: number, code: string, message = code): MockResponse => ({
  status,
  body: { error: { code, message } },
});

/** Renders the real route table at `path`. */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(<RouterProvider router={router} />);
  return { ...utils, router };
}

export const slotFixture = (overrides: Partial<Slot> = {}): Slot => ({
  id: '0b7f5d1e-1c2a-4c55-9a1d-1f4c2b7e9a01',
  // 10:00-10:30 in Europe/Skopje (UTC+2 in June).
  startTime: '2030-06-03T08:00:00.000Z',
  endTime: '2030-06-03T08:30:00.000Z',
  durationMinutes: 30,
  status: 'AVAILABLE',
  ...overrides,
});

export const confirmationFixture = (overrides: Partial<BookingConfirmation> = {}): BookingConfirmation => ({
  name: 'Ana Petrova',
  status: 'CONFIRMED',
  slot: { startTime: '2030-06-03T12:00:00.000Z', endTime: '2030-06-03T12:45:00.000Z', durationMinutes: 45 },
  ...overrides,
});

export const hostBookingFixture = (overrides: Partial<HostBooking> = {}): HostBooking => ({
  id: 'b1',
  name: 'Ana Petrova',
  email: 'ana@example.com',
  status: 'CONFIRMED',
  createdAt: '2030-06-01T10:00:00.000Z',
  slot: slotFixture({ status: 'BOOKED' }),
  ...overrides,
});

export const TOKEN = 'Q2xhdWRlQ29kZVRlc3RUb2tlbl9fX19fX19fX19fX18';
