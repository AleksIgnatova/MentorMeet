/**
 * Stable, machine-readable error codes returned in `{ error: { code } }`.
 * Clients may branch on these, so treat them as part of the public API.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  SLOT_IN_PAST: 'SLOT_IN_PAST',
  SLOT_OVERLAP: 'SLOT_OVERLAP',
  SLOT_HAS_BOOKING: 'SLOT_HAS_BOOKING',
  SLOT_ALREADY_BOOKED: 'SLOT_ALREADY_BOOKED',
  SLOT_NOT_AVAILABLE: 'SLOT_NOT_AVAILABLE',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorDetail = { path: string; message: string };

export type ErrorResponseBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    stack?: string;
  };
};

/** An error that is safe to expose to the client as-is. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new HttpError(400, ErrorCode.VALIDATION_ERROR, message, details);

export const notFound = (message = 'Resource not found.', code: ErrorCode = ErrorCode.NOT_FOUND) =>
  new HttpError(404, code, message);

export const conflict = (message: string, code: ErrorCode = ErrorCode.CONFLICT) =>
  new HttpError(409, code, message);
