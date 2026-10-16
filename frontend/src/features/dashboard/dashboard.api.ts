import { apiClient } from '../../lib/api-client';
import type { HostBooking } from '../../types/booking';
import type { CreateSlotRequest, Slot } from '../../types/slot';

/** All slots whose start falls on `from`..`to` (inclusive, Europe/Skopje days). */
export const listSlots = (range: { from: string; to: string }, signal?: AbortSignal) =>
  apiClient.request<Slot[]>('/slots', { query: range, signal });

export const createSlot = (input: CreateSlotRequest) =>
  apiClient.request<Slot>('/slots', { method: 'POST', body: input });

export const deleteSlot = (id: string) =>
  apiClient.request<void>(`/slots/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Bookings whose session has not ended yet. */
export const listUpcomingBookings = (signal?: AbortSignal) =>
  apiClient.request<HostBooking[]>('/bookings', { query: { upcoming: true }, signal });
