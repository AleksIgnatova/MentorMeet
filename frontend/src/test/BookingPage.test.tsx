import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayInZone } from '../lib/date-time';
import type { Slot } from '../types/slot';
import {
  apiError,
  confirmationFixture,
  mockFetch,
  ok,
  renderRoute,
  slotFixture,
  TOKEN,
  type MockRequest,
  type MockResponse,
} from './utils';

const first = slotFixture();
const second = slotFixture({
  id: '0b7f5d1e-1c2a-4c55-9a1d-1f4c2b7e9a02',
  startTime: '2030-06-03T09:00:00.000Z',
  endTime: '2030-06-03T09:45:00.000Z',
  durationMinutes: 45,
});

afterEach(() => vi.unstubAllGlobals());

const isSlotList = (r: MockRequest) => r.method === 'GET' && r.url.pathname === '/api/slots';

async function chooseSlotAndFillForm(user: ReturnType<typeof userEvent.setup>, time: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(time) }));
  await user.type(screen.getByLabelText('Your name'), 'Ana Petrova');
  await user.type(screen.getByLabelText('Email address'), 'ana@example.com');
}

describe('BookingPage', () => {
  it('loads available slots for today in Europe/Skopje and shows their times', async () => {
    const { requests } = mockFetch(() => ok([first, second]));
    renderRoute('/book');

    expect(screen.getByText('Loading available times…')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Available times' });
    expect(within(list).getByText('10:00–10:30')).toBeInTheDocument();
    expect(within(list).getByText('11:00–11:45')).toBeInTheDocument();

    const query = requests[0]!.url.searchParams;
    expect(requests[0]!.url.pathname).toBe('/api/slots');
    expect(query.get('from')).toBe(todayInZone());
    expect(query.get('to')).toBe(todayInZone());
    expect(query.get('status')).toBe('AVAILABLE');
  });

  it('shows an empty state when no times are free and loads the next day on request', async () => {
    const user = userEvent.setup();
    const { requests } = mockFetch(() => ok([]));
    renderRoute('/book');

    expect(await screen.findByText('No free times on this day')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show next day' }));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.url.searchParams.get('from')).not.toBe(todayInZone());
  });

  it('shows an error state and recovers after retry', async () => {
    const user = userEvent.setup();
    let failing = true;
    mockFetch(() => (failing ? apiError(500, 'INTERNAL_ERROR') : ok([first])));
    renderRoute('/book');

    expect(await screen.findByText('Could not load available times')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong on our side. Please try again.')).toBeInTheDocument();

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('10:00–10:30')).toBeInTheDocument();
  });

  it('books the selected slot and navigates to the confirmation page', async () => {
    const user = userEvent.setup();
    const { requests } = mockFetch((r): MockResponse => {
      if (isSlotList(r)) return ok([first, second]);
      if (r.method === 'POST') return ok({ ...confirmationFixture(), confirmationToken: TOKEN }, 201);
      if (r.url.pathname === `/api/bookings/${TOKEN}`) return ok(confirmationFixture());
      return apiError(404, 'ROUTE_NOT_FOUND');
    });
    const { router } = renderRoute('/book');

    await chooseSlotAndFillForm(user, '11:00–11:45');
    expect(screen.getByRole('button', { name: /11:00–11:45/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/booking/confirmation/${TOKEN}`);
    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.url.pathname).toBe('/api/bookings');
    // Only the slot id and the visitor's details: times/status are decided by the server.
    expect(post.body).toEqual({ timeSlotId: second.id, name: 'Ana Petrova', email: 'ana@example.com' });
  });

  it('on 409 Conflict refreshes the list, removes the taken slot and explains what happened', async () => {
    const user = userEvent.setup();
    let available: Slot[] = [first, second];
    const { requests } = mockFetch((r) => {
      if (isSlotList(r)) return ok(available);
      available = [second]; // Someone else booked `first` just before us.
      return apiError(409, 'SLOT_ALREADY_BOOKED', 'This time slot is no longer available.');
    });
    renderRoute('/book');

    await chooseSlotAndFillForm(user, '10:00–10:30');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(
      await screen.findByText('Sorry, that time was just booked by someone else. Please choose another time.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('10:00–10:30')).not.toBeInTheDocument());
    expect(screen.getByText('11:00–11:45')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(requests.filter(isSlotList)).toHaveLength(2);
  });

  it('sends only one booking request when the button is clicked repeatedly', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { requests } = mockFetch(async (r) => {
      if (isSlotList(r)) return ok([first]);
      if (r.method === 'POST') {
        await new Promise<void>((resolve) => (release = resolve));
        return ok({ ...confirmationFixture(), confirmationToken: TOKEN }, 201);
      }
      return ok(confirmationFixture());
    });
    renderRoute('/book');

    await chooseSlotAndFillForm(user, '10:00–10:30');
    const button = screen.getByRole('button', { name: 'Confirm booking' });
    await user.tripleClick(button);

    expect(screen.getByRole('button', { name: /Booking…/ })).toBeDisabled();
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    release();
    expect(await screen.findByRole('heading', { name: 'Your session is booked' })).toBeInTheDocument();
  });

  it('shows a clear message when booking is rate limited and keeps the selection', async () => {
    const user = userEvent.setup();
    mockFetch((r) => (isSlotList(r) ? ok([first]) : apiError(429, 'RATE_LIMITED')));
    renderRoute('/book');

    await chooseSlotAndFillForm(user, '10:00–10:30');
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(
      await screen.findByText('Too many requests. Please wait a few minutes and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Ana Petrova');
  });
});
