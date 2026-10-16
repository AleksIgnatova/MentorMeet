import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Slot } from '../types/slot';
import {
  apiError,
  hostBookingFixture,
  mockFetch,
  ok,
  renderRoute,
  slotFixture,
  type MockRequest,
  type MockResponse,
} from './utils';

afterEach(() => vi.unstubAllGlobals());

const free = slotFixture();
const booked = slotFixture({
  id: '0b7f5d1e-1c2a-4c55-9a1d-1f4c2b7e9a03',
  startTime: '2030-06-03T12:00:00.000Z',
  endTime: '2030-06-03T13:00:00.000Z',
  durationMinutes: 60,
  status: 'BOOKED',
});

function api(overrides: (r: MockRequest) => MockResponse | undefined = () => undefined) {
  let slots: Slot[] = [free, booked];
  const mock = mockFetch((r) => {
    const custom = overrides(r);
    if (custom) return custom;
    if (r.method === 'GET' && r.url.pathname === '/api/slots') return ok(slots);
    if (r.method === 'GET' && r.url.pathname === '/api/bookings') return ok([hostBookingFixture({ slot: booked })]);
    if (r.method === 'DELETE') {
      slots = slots.filter((s) => !r.url.pathname.endsWith(s.id));
      return { status: 204 };
    }
    if (r.method === 'POST') return ok(slotFixture({ id: 'new' }), 201);
    return apiError(404, 'ROUTE_NOT_FOUND');
  });
  return mock;
}

describe('DashboardPage', () => {
  it('shows statistics, slots grouped by day and upcoming bookings from the API', async () => {
    const { requests } = api();
    renderRoute('/dashboard');

    const slotsCard = await screen.findByRole('region', { name: 'Monday, 3 June 2030' });
    expect(within(slotsCard).getByText('10:00–10:30')).toBeInTheDocument();
    expect(within(slotsCard).getByText('14:00–15:00')).toBeInTheDocument();
    expect(within(slotsCard).getByText('Available')).toBeInTheDocument();
    expect(within(slotsCard).getByText('Booked')).toBeInTheDocument();

    const stats = screen.getByRole('region', { name: 'Statistics' });
    expect(within(stats).getByText('Available slots').nextSibling).toHaveTextContent('1');
    expect(within(stats).getByText('Booked slots').nextSibling).toHaveTextContent('1');
    expect(await within(stats).findByText('14:00')).toBeInTheDocument(); // Next session.

    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(requests.find((r) => r.url.pathname === '/api/bookings')!.url.searchParams.get('upcoming')).toBe('true');
    const slotQuery = requests.find((r) => r.url.pathname === '/api/slots')!.url.searchParams;
    expect(slotQuery.get('status')).toBeNull(); // The host sees all statuses.
  });

  it('creates a slot with the Europe/Skopje offset and reloads the list', async () => {
    const user = userEvent.setup();
    const { requests } = api();
    renderRoute('/dashboard');
    await screen.findByText('10:00–10:30');

    await user.click(screen.getAllByRole('button', { name: 'New slot' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'New time slot' });
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2030-12-03' } });
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '09:30' } });
    await user.selectOptions(within(dialog).getByLabelText('Duration'), '45');
    await user.click(within(dialog).getByRole('button', { name: 'Create slot' }));

    expect(await screen.findByText('Slot created.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.body).toEqual({ startTime: '2030-12-03T09:30:00.000+01:00', durationMinutes: 45 });
    await waitFor(() => expect(requests.filter((r) => r.url.pathname === '/api/slots' && r.method === 'GET')).toHaveLength(2));
  });

  it('explains an overlapping slot and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api((r) => (r.method === 'POST' ? apiError(409, 'SLOT_OVERLAP', 'overlap') : undefined));
    renderRoute('/dashboard');
    await screen.findByText('10:00–10:30');

    await user.click(screen.getAllByRole('button', { name: 'New slot' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'New time slot' });
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2030-06-03' } });
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '10:15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create slot' }));

    expect(
      await within(dialog).findByText('This time overlaps an existing slot. Please choose a different time.'),
    ).toBeInTheDocument();
  });

  it('validates the slot form before calling the API', async () => {
    const user = userEvent.setup();
    const { requests } = api();
    renderRoute('/dashboard');
    await screen.findByText('10:00–10:30');

    await user.click(screen.getAllByRole('button', { name: 'New slot' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'New time slot' });
    await user.click(within(dialog).getByRole('button', { name: 'Create slot' }));

    expect(within(dialog).getByText('Please choose a start time.')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('deletes an available slot after confirmation', async () => {
    const user = userEvent.setup();
    const { requests } = api();
    renderRoute('/dashboard');
    await screen.findByText('10:00–10:30');

    // Only available slots can be deleted: exactly one delete button.
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete slot/ });
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]!);
    // Focus starts on Cancel, so pressing Enter does not delete by accident.
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete slot' }));

    expect(await screen.findByText('Slot deleted.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'DELETE')!.url.pathname).toBe(`/api/slots/${free.id}`);
    await waitFor(() => expect(screen.queryByText('10:00–10:30')).not.toBeInTheDocument());
  });

  it('explains when a slot was booked before it could be deleted', async () => {
    const user = userEvent.setup();
    api((r) => (r.method === 'DELETE' ? apiError(409, 'SLOT_HAS_BOOKING', 'has booking') : undefined));
    renderRoute('/dashboard');
    await screen.findByText('10:00–10:30');

    await user.click(screen.getByRole('button', { name: /^Delete slot/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete slot' }));

    expect(
      await screen.findByText('This slot was booked in the meantime and can no longer be deleted.'),
    ).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    mockFetch((r) => (r.url.pathname === '/api/slots' ? ok([]) : apiError(500, 'INTERNAL_ERROR')));
    renderRoute('/dashboard');

    expect(await screen.findByText('No slots in this period')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
