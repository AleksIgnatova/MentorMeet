import { apiClient } from '../../lib/api-client';
import type { BookingConfirmation } from '../../types/booking';

export const getConfirmation = (token: string, signal?: AbortSignal) =>
  apiClient.request<BookingConfirmation>(`/bookings/${encodeURIComponent(token)}`, { signal });
