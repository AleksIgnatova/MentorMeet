import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, confirmationFixture, mockFetch, ok, renderRoute, TOKEN } from './utils';

afterEach(() => vi.unstubAllGlobals());

describe('ConfirmationPage', () => {
  it('loads the booking by token and shows name, date, time and duration', async () => {
    const { requests } = mockFetch(() => ok(confirmationFixture()));
    renderRoute(`/booking/confirmation/${TOKEN}`);

    expect(screen.getByText('Loading your booking…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
    expect(screen.getByText('Ana Petrova')).toBeInTheDocument();
    expect(screen.getByText('Monday, 3 June 2030')).toBeInTheDocument();
    expect(screen.getByText('14:00–14:45 (Europe/Skopje)')).toBeInTheDocument();
    expect(screen.getByText('45 minutes')).toBeInTheDocument();
    expect(screen.getByText(/Thank you, Ana Petrova!/)).toBeInTheDocument();
    expect(requests[0]!.url.pathname).toBe(`/api/bookings/${TOKEN}`);
  });

  it('still shows the booking after a refresh, because it is loaded from the API again', async () => {
    const { requests } = mockFetch(() => ok(confirmationFixture()));
    const firstVisit = renderRoute(`/booking/confirmation/${TOKEN}`);
    expect(await screen.findByText('Ana Petrova')).toBeInTheDocument();
    firstVisit.unmount();

    renderRoute(`/booking/confirmation/${TOKEN}`); // A fresh page load with only the URL.
    expect(await screen.findByText('Ana Petrova')).toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });

  it('shows an invalid-token message for an unknown token', async () => {
    mockFetch(() => apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.'));
    renderRoute('/booking/confirmation/does-not-exist');

    expect(await screen.findByText('Booking not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows a network error with a working retry', async () => {
    const user = userEvent.setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        if (calls === 1) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(new Response(JSON.stringify({ data: confirmationFixture() }), { status: 200 }));
      }),
    );
    renderRoute(`/booking/confirmation/${TOKEN}`);

    expect(await screen.findByText('Could not load your booking')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ana Petrova')).toBeInTheDocument();
  });
});
