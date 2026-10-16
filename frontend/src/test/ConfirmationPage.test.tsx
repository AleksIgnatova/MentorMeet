import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingConfirmation } from '../types/booking';
import {
  apiError,
  confirmationFixture,
  mockFetch,
  ok,
  renderRoute,
  TOKEN,
  type MockRequest,
  type MockResponse,
} from './utils';

afterEach(() => vi.unstubAllGlobals());

const AI_MESSAGE = 'Ana, your 45-minute session on Monday, 3 June is booked. Enjoy it!';
const STATIC_FALLBACK = /Thank you, Ana Petrova! Your mentoring session is confirmed/;

const isMessageRequest = (r: MockRequest) => r.method === 'POST' && r.url.pathname === '/api/ai/confirmation';
const isBookingRequest = (r: MockRequest) => r.method === 'GET' && r.url.pathname === `/api/bookings/${TOKEN}`;

/** Booking lookup plus the AI message endpoint. */
function confirmationApi({
  booking = confirmationFixture(),
  message = (): MockResponse | Promise<MockResponse> => ok({ message: AI_MESSAGE, source: 'ai' }),
}: { booking?: BookingConfirmation; message?: () => MockResponse | Promise<MockResponse> } = {}) {
  return (r: MockRequest) => {
    if (isBookingRequest(r)) return ok(booking);
    if (isMessageRequest(r)) return message();
    return apiError(404, 'ROUTE_NOT_FOUND');
  };
}

describe('ConfirmationPage', () => {
  it('loads the booking by token and shows name, date, time and duration', async () => {
    const { requests } = mockFetch(confirmationApi());
    renderRoute(`/booking/confirmation/${TOKEN}`);

    expect(screen.getByText('Loading your booking…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
    expect(screen.getByText('Ana Petrova')).toBeInTheDocument();
    expect(screen.getByText('Monday, 3 June 2030')).toBeInTheDocument();
    expect(screen.getByText('14:00–14:45 (Europe/Skopje)')).toBeInTheDocument();
    expect(screen.getByText('45 minutes')).toBeInTheDocument();
    expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
    expect(requests[0]!.url.pathname).toBe(`/api/bookings/${TOKEN}`);
  });

  it('still shows the booking after a refresh, because it is loaded from the API again', async () => {
    const { requests } = mockFetch(confirmationApi());
    const firstVisit = renderRoute(`/booking/confirmation/${TOKEN}`);
    expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
    firstVisit.unmount();

    renderRoute(`/booking/confirmation/${TOKEN}`); // A fresh page load with only the URL.
    expect(await screen.findByText('Ana Petrova')).toBeInTheDocument();
    expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
    expect(requests.filter(isBookingRequest)).toHaveLength(2);
    expect(requests.filter(isMessageRequest)).toHaveLength(2);
  });

  it('shows an invalid-token message for an unknown token', async () => {
    const { requests } = mockFetch(() => apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.'));
    renderRoute('/booking/confirmation/does-not-exist');

    expect(await screen.findByText('Booking not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(requests.filter(isMessageRequest)).toHaveLength(0);
  });

  it('shows a network error with a working retry', async () => {
    const user = userEvent.setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        if (calls === 1) return Promise.reject(new TypeError('Failed to fetch'));
        // Retry succeeds; the message request gets the booking shape, i.e. no usable message.
        return Promise.resolve(new Response(JSON.stringify({ data: confirmationFixture() }), { status: 200 }));
      }),
    );
    renderRoute(`/booking/confirmation/${TOKEN}`);

    expect(await screen.findByText('Could not load your booking')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ana Petrova')).toBeInTheDocument();
  });

  describe('personal message', () => {
    it('shows the AI message, requested with only the token', async () => {
      const { requests } = mockFetch(confirmationApi());
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText(STATIC_FALLBACK)).not.toBeInTheDocument();
      const [messageRequest] = requests.filter(isMessageRequest);
      expect(messageRequest!.body).toEqual({ token: TOKEN });
    });

    it("shows the backend's fallback message when AI is not available", async () => {
      mockFetch(confirmationApi({ message: () => ok({ message: 'Prepared fallback text.', source: 'fallback' }) }));
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByText('Prepared fallback text.')).toBeInTheDocument();
    });

    it('shows the booking details while the message is still loading', async () => {
      let release!: () => void;
      mockFetch(
        confirmationApi({
          message: () =>
            new Promise((resolve) => {
              release = () => resolve(ok({ message: AI_MESSAGE, source: 'ai' }));
            }),
        }),
      );
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByText('45 minutes')).toBeInTheDocument();
      expect(screen.getByText('Preparing your personal message…')).toBeInTheDocument();
      release();
      expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText('Preparing your personal message…')).not.toBeInTheDocument();
    });

    it.each([
      ['a server error', () => apiError(500, 'INTERNAL_ERROR')],
      ['rate limiting', () => apiError(429, 'RATE_LIMITED')],
      ['an unusable response', () => ok({ message: '   ' })],
      ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ])('falls back to the static message on %s and keeps the booking visible', async (_label, message) => {
      mockFetch(confirmationApi({ message }));
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByText(STATIC_FALLBACK)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
      expect(screen.getByText('Ana Petrova')).toBeInTheDocument();
      expect(screen.queryByText('Could not load your booking')).not.toBeInTheDocument();
    });

    it('does not request a message for a cancelled booking', async () => {
      const { requests } = mockFetch(confirmationApi({ booking: confirmationFixture({ status: 'CANCELLED' }) }));
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByRole('heading', { name: 'This booking was cancelled' })).toBeInTheDocument();
      expect(requests.filter(isMessageRequest)).toHaveLength(0);
      expect(screen.queryByText(STATIC_FALLBACK)).not.toBeInTheDocument();
    });
  });
});
