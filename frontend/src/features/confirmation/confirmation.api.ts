import { ApiError, apiClient, ClientErrorCode } from '../../lib/api-client';
import type { BookingConfirmation, ConfirmationMessage } from '../../types/booking';

export const getConfirmation = (token: string, signal?: AbortSignal) =>
  apiClient.request<BookingConfirmation>(`/bookings/${encodeURIComponent(token)}`, { signal });

/**
 * The personal confirmation message. The backend loads the booking by token and
 * calls the AI provider itself, so only the token is sent. A response without a
 * usable message is treated as an error, so the page shows its own fallback.
 */
export async function getConfirmationMessage(token: string, signal?: AbortSignal): Promise<ConfirmationMessage> {
  const data = await apiClient.request<Partial<ConfirmationMessage> | null>('/ai/confirmation', {
    method: 'POST',
    body: { token },
    signal,
  });
  if (typeof data?.message !== 'string' || data.message.trim() === '') {
    throw new ApiError(200, ClientErrorCode.UNEXPECTED_RESPONSE, 'Unexpected confirmation message response.');
  }
  return { message: data.message, source: data.source === 'ai' ? 'ai' : 'fallback' };
}
