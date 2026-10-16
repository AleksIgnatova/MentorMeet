// @vitest-environment node
/**
 * Opt-in contract test: runs the frontend's real API modules against a running
 * backend over HTTP, verifying paths, envelopes, status codes and error codes.
 *
 * It CREATES DATA, so it only runs when MENTORMEET_CONTRACT_TEST=1 and should
 * target a backend that uses the test database:
 *   MENTORMEET_CONTRACT_TEST=1 VITE_API_BASE_URL=http://localhost:3999/api npm run test:contract
 */
import { describe, expect, it } from 'vitest';
import { getConfirmation } from '../features/confirmation/confirmation.api';
import { createSlot, deleteSlot, listSlots, listUpcomingBookings } from '../features/dashboard/dashboard.api';
import { createBooking, listAvailableSlots } from '../features/public-booking/booking.api';
import { API_BASE_URL } from '../lib/api-client';
import { zonedDateTimeToIso } from '../lib/date-time';

// Runs in Node (see the environment pragma); browser code deliberately has no Node typings.
declare const process: { env: Record<string, string | undefined> };
const enabled = process.env.MENTORMEET_CONTRACT_TEST === '1';

// A random future day/time so repeated runs do not overlap earlier slots.
const day = `2031-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;
const minute = String(Math.floor(Math.random() * 4) * 15).padStart(2, '0');
const hour = String(8 + Math.floor(Math.random() * 10)).padStart(2, '0');

describe.skipIf(!enabled)(`API contract against ${API_BASE_URL}`, () => {
  it('supports the full slot and booking flow used by the pages', async () => {
    // Dashboard: create a slot (Skopje wall-clock time with offset).
    const slot = await createSlot({ startTime: zonedDateTimeToIso(day, `${hour}:${minute}`), durationMinutes: 30 });
    expect(slot).toMatchObject({ durationMinutes: 30, status: 'AVAILABLE' });
    expect(new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()).toBe(30 * 60_000);

    // Overlap is rejected with the documented code.
    await expect(
      createSlot({ startTime: zonedDateTimeToIso(day, `${hour}:${minute}`), durationMinutes: 15 }),
    ).rejects.toMatchObject({ status: 409, code: 'SLOT_OVERLAP' });

    // Dashboard and booking page both list it.
    expect((await listSlots({ from: day, to: day })).map((s) => s.id)).toContain(slot.id);
    expect((await listAvailableSlots(day)).map((s) => s.id)).toContain(slot.id);

    // Booking page: book it.
    const booking = await createBooking({ timeSlotId: slot.id, name: 'Contract Test', email: 'contract@example.com' });
    expect(booking).toEqual({
      name: 'Contract Test',
      status: 'CONFIRMED',
      slot: { startTime: slot.startTime, endTime: slot.endTime, durationMinutes: 30 },
      confirmationToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
    });

    // It is no longer available; a second booking gets the conflict the page handles.
    expect((await listAvailableSlots(day)).map((s) => s.id)).not.toContain(slot.id);
    await expect(
      createBooking({ timeSlotId: slot.id, name: 'Second', email: 'second@example.com' }),
    ).rejects.toMatchObject({ status: 409, code: 'SLOT_ALREADY_BOOKED' });

    // Confirmation page: loads by token (works after a refresh: it's a plain GET).
    expect(await getConfirmation(booking.confirmationToken)).toEqual({
      name: 'Contract Test',
      status: 'CONFIRMED',
      slot: { startTime: slot.startTime, endTime: slot.endTime, durationMinutes: 30 },
    });
    await expect(getConfirmation('not-a-real-token')).rejects.toMatchObject({
      status: 404,
      code: 'BOOKING_NOT_FOUND',
    });

    // Dashboard: upcoming bookings include it; a booked slot cannot be deleted.
    const upcoming = await listUpcomingBookings();
    expect(upcoming.find((b) => b.slot.id === slot.id)).toMatchObject({
      name: 'Contract Test',
      email: 'contract@example.com',
      slot: { id: slot.id, status: 'BOOKED' },
    });
    await expect(deleteSlot(slot.id)).rejects.toMatchObject({ status: 409, code: 'SLOT_HAS_BOOKING' });

    // A free slot can be deleted (204 -> undefined).
    const other = await createSlot({
      startTime: zonedDateTimeToIso(day, `${String(Number(hour) + 2).padStart(2, '0')}:${minute}`),
      durationMinutes: 15,
    });
    await expect(deleteSlot(other.id)).resolves.toBeUndefined();
  });
});
