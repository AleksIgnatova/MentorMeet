import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorCode, HttpError, type ErrorResponseBody } from '../common/http-errors';

type ErrorHandlerOptions = {
  /** Include stack traces in responses. Must be false in production. */
  exposeStack: boolean;
  log?: (message: string, error: string) => void;
};

/**
 * Reduces an error to name, code, message and stack for logging. The raw object
 * is never logged: Prisma errors carry full database rows (e.g. emails) in `meta`.
 */
export function describeErrorForLog(err: unknown): string {
  if (!(err instanceof Error)) return `Non-error value thrown (${typeof err})`;
  const code = (err as { code?: unknown }).code;
  const header = `${err.name}${typeof code === 'string' ? ` [${code}]` : ''}: ${err.message}`;
  const frames = err.stack?.split('\n').filter((line) => line.trimStart().startsWith('at ')) ?? [];
  return [header, ...frames].join('\n');
}

/** Errors raised by express.json() / body-parser carry a `type` and `status`. */
function isBodyParserError(err: unknown): err is Error & { type: string; status: number } {
  return (
    err instanceof Error &&
    typeof (err as { type?: unknown }).type === 'string' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

function toHttpError(err: unknown): HttpError | undefined {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    return new HttpError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed.',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new HttpError(400, ErrorCode.INVALID_JSON, 'Request body is not valid JSON.');
    }
    if (err.type === 'entity.too.large') {
      return new HttpError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large.');
    }
    if (err.status >= 400 && err.status < 500) {
      return new HttpError(400, ErrorCode.VALIDATION_ERROR, 'Malformed request body.');
    }
  }

  return undefined;
}

export function createErrorHandler({
  exposeStack,
  log = (message, error) => console.error(message, error),
}: ErrorHandlerOptions): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const known = toHttpError(err);
    const httpError =
      known ?? new HttpError(500, ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred.');

    if (!known) {
      // Log only the method and a sanitized error summary: URLs, bodies and
      // Prisma error metadata may contain personal data or confirmation tokens.
      log(`[error] Unhandled error during ${req.method} request`, describeErrorForLog(err));
    }

    const body: ErrorResponseBody = {
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details ? { details: httpError.details } : {}),
        ...(exposeStack && !known && err instanceof Error && err.stack
          ? { stack: err.stack }
          : {}),
      },
    };

    res.status(httpError.status).json(body);
  };
}
