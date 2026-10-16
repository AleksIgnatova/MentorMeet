import { ClientErrorCode, isApiError } from './api-client';

/** A human-readable message for any error thrown by the API client. */
export function describeError(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case ClientErrorCode.NETWORK_ERROR:
      return 'Could not reach the server. Please check your connection and try again.';
    case ClientErrorCode.TIMEOUT:
      return 'The server took too long to respond. Please try again.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please wait a few minutes and try again.';
    case 'INTERNAL_ERROR':
    case ClientErrorCode.UNEXPECTED_RESPONSE:
      return 'Something went wrong on our side. Please try again.';
    default:
      // Backend messages for 4xx errors are written for end users.
      return error.message;
  }
}
