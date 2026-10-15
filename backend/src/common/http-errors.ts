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

export const notFound = (message = 'Resource not found.') =>
  new HttpError(404, ErrorCode.NOT_FOUND, message);

export const conflict = (message: string, code: ErrorCode = ErrorCode.CONFLICT) =>
  new HttpError(409, code, message);
