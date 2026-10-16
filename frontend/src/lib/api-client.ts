/**
 * Central HTTP client for the MentorMeet API.
 *
 * Contract (see docs/api.md): success bodies are `{ data }`, errors are
 * `{ error: { code, message, details? } }`, and 204 has no body. Every failure
 * is normalised into an ApiError so pages can branch on `status`/`code`.
 */

export type ApiErrorDetail = { path: string; message: string };

/** Client-side codes, in addition to the backend's stable error codes. */
export const ClientErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when no response was received. */
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export type QueryValue = string | number | boolean | undefined;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 15_000;

type ErrorBody = { error?: { code?: unknown; message?: unknown; details?: unknown } };

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as ErrorBody | null)?.error;
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    const details = Array.isArray(error.details) ? (error.details as ApiErrorDetail[]) : [];
    return new ApiError(status, error.code, error.message, details);
  }
  return new ApiError(status, ClientErrorCode.UNEXPECTED_RESPONSE, `Unexpected response (HTTP ${status}).`);
}

export function createApiClient(
  baseUrl: string,
  { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // Relative base URLs (e.g. "/api") resolve against the current page; absolute ones need no origin.
    const url = new URL(`${root}${path}`, globalThis.location?.origin);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error; // Cancelled by the caller: not a user-facing error.
      if (timeout.aborted) {
        throw new ApiError(0, ClientErrorCode.TIMEOUT, 'The server took too long to respond.');
      }
      throw new ApiError(0, ClientErrorCode.NETWORK_ERROR, 'Could not reach the server.');
    }

    if (response.status === 204) return undefined as T;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) throw toApiError(response.status, body);
    if (body === null || typeof body !== 'object' || !('data' in body)) {
      throw toApiError(response.status, null);
    }
    return (body as { data: T }).data;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Configured from VITE_API_BASE_URL; falls back to the local backend in development. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api');

export const apiClient = createApiClient(API_BASE_URL);
