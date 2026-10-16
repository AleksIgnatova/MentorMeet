import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  confirmationFixture,
  hostBookingFixture,
  mockFetch,
  ok,
  renderRoute,
  slotFixture,
  TOKEN,
  type MockRequest,
  type MockResponse,
} from './utils';

afterEach(() => vi.unstubAllGlobals());

const AI_MESSAGE = 'Ana, your session is booked. See you soon!';

/** Every endpoint the three pages use, so tests can move between them freely. */
function api(r: MockRequest): MockResponse {
  const path = r.url.pathname;
  if (r.method === 'GET' && path === '/api/slots') return ok([slotFixture()]);
  if (r.method === 'GET' && path === '/api/bookings') return ok([hostBookingFixture()]);
  if (r.method === 'POST' && path === '/api/bookings') return ok({ ...confirmationFixture(), confirmationToken: TOKEN }, 201);
  if (r.method === 'GET' && path === `/api/bookings/${TOKEN}`) return ok(confirmationFixture());
  if (r.method === 'POST' && path === '/api/ai/confirmation') return ok({ message: AI_MESSAGE, source: 'ai' });
  return apiError(404, 'ROUTE_NOT_FOUND');
}

const dashboardHeading = () => screen.findByRole('heading', { level: 1, name: 'Dashboard' });
const bookingHeading = () => screen.findByRole('heading', { level: 1, name: 'Book a mentoring session' });

/**
 * Clicks a link and returns whether the browser would have followed it.
 * React Router's Link cancels the default action and navigates client-side,
 * so `false` means "no full page load".
 */
const clickFollowsHref = (link: HTMLElement) => fireEvent.click(link);

describe('navigation', () => {
  it('redirects the root URL to the dashboard', async () => {
    mockFetch(api);
    const { router } = renderRoute('/');

    expect(await dashboardHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it.each([
    ['/dashboard', dashboardHeading],
    ['/book', bookingHeading],
  ])('opens %s directly', async (path, heading) => {
    mockFetch(api);
    const { router } = renderRoute(path);

    expect(await heading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('shows the not-found page for unknown routes', async () => {
    mockFetch(api);
    renderRoute('/no-such-page');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  describe('booking page', () => {
    it('has a "Back to Dashboard" link that navigates without reloading the page', async () => {
      mockFetch(api);
      const { router } = renderRoute('/book');
      await bookingHeading();

      const back = screen.getByRole('link', { name: 'Back to Dashboard' });
      expect(back).toHaveAttribute('href', '/dashboard');
      expect(back).toHaveTextContent(/^←\s*Back to Dashboard$/); // Arrow is aria-hidden; spacing comes from CSS gap.

      expect(clickFollowsHref(back)).toBe(false);
      expect(await dashboardHeading()).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  describe('confirmation page', () => {
    it('keeps the booking details and message, and offers both next steps', async () => {
      mockFetch(api);
      renderRoute(`/booking/confirmation/${TOKEN}`);

      expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
      expect(screen.getByText('Ana Petrova')).toBeInTheDocument();
      expect(screen.getByText('45 minutes')).toBeInTheDocument();

      const nextSteps = screen.getByRole('navigation', { name: 'Next steps' });
      expect(nextSteps).toContainElement(screen.getByRole('link', { name: 'Book another session' }));
      expect(nextSteps).toContainElement(screen.getByRole('link', { name: 'Go to Dashboard' }));
      expect(screen.getByRole('link', { name: 'Book another session' })).toHaveAttribute('href', '/book');
      expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard');
    });

    it.each([
      ['Go to Dashboard', '/dashboard', dashboardHeading],
      ['Book another session', '/book', bookingHeading],
    ])('"%s" navigates to %s without reloading the page', async (name, path, heading) => {
      mockFetch(api);
      const { router } = renderRoute(`/booking/confirmation/${TOKEN}`);
      await screen.findByText(AI_MESSAGE);

      expect(clickFollowsHref(screen.getByRole('link', { name }))).toBe(false);
      expect(await heading()).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
    });

    it('still offers both actions when the booking cannot be found', async () => {
      mockFetch(() => apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.'));
      renderRoute('/booking/confirmation/does-not-exist');

      expect(await screen.findByText('Booking not found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Book another session' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toBeInTheDocument();
    });
  });

  it('dashboard → book → confirm a booking → back to the dashboard, all client-side', async () => {
    const user = userEvent.setup();
    const { requests } = mockFetch(api);
    const { router } = renderRoute('/');
    await dashboardHeading();

    await user.click(screen.getByRole('link', { name: 'Public booking page' }));
    await bookingHeading();
    await user.click(await screen.findByRole('button', { name: /10:00–10:30/ }));
    await user.type(screen.getByLabelText('Your name'), 'Ana Petrova');
    await user.type(screen.getByLabelText('Email address'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByText(AI_MESSAGE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/booking/confirmation/${TOKEN}`);

    await user.click(screen.getByRole('link', { name: 'Go to Dashboard' }));
    expect(await dashboardHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    // One booking was created; navigating around did not repeat it.
    expect(requests.filter((r) => r.method === 'POST' && r.url.pathname === '/api/bookings')).toHaveLength(1);
  });
});
