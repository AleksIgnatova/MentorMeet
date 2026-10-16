import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockFetch, ok } from '../test/utils';
import { ApiError, createApiClient } from './api-client';

const client = createApiClient('http://api.test/api/');

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('unwraps the { data } envelope and builds the URL with query parameters', async () => {
    const { requests } = mockFetch(() => ok([{ id: 1 }]));

    const data = await client.request<{ id: number }[]>('/slots', {
      query: { from: '2030-06-01', to: '2030-06-02', status: undefined },
    });

    expect(data).toEqual([{ id: 1 }]);
    expect(requests[0]!.url.toString()).toBe('http://api.test/api/slots?from=2030-06-01&to=2030-06-02');
  });

  it('sends JSON bodies', async () => {
    const fetchMock = mockFetch(() => ok({ id: 'x' }, 201));
    await client.request('/bookings', { method: 'POST', body: { name: 'Ana' } });

    expect(fetchMock.requests[0]).toMatchObject({ method: 'POST', body: { name: 'Ana' } });
    const init = fetchMock.fn.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch(() => ({ status: 204 }));
    await expect(client.request('/slots/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('turns the error envelope into an ApiError with status, code and details', async () => {
    mockFetch(() => ({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: [{ path: 'email', message: 'Bad' }] } },
    }));

    const error = await client.request('/bookings').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: [{ path: 'email', message: 'Bad' }],
    });
  });

  it('keeps backend conflict codes', async () => {
    mockFetch(() => apiError(409, 'SLOT_ALREADY_BOOKED', 'Taken'));
    await expect(client.request('/bookings', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'SLOT_ALREADY_BOOKED',
    });
  });

  it('reports a non-JSON error response as UNEXPECTED_RESPONSE', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))));
    await expect(client.request('/slots')).rejects.toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE' });
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(client.request('/slots')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('reports a timeout as TIMEOUT', async () => {
    const slowClient = createApiClient('http://api.test/api', { timeoutMs: 10 });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );
    await expect(slowClient.request('/slots')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
