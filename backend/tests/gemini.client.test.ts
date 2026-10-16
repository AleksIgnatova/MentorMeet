import { AiProviderError, createGeminiClient, GEMINI_API_BASE_URL } from '../src/modules/ai/gemini.client';

const API_KEY = 'test-gemini-key-not-real';
const input = { system: 'Be brief.', prompt: 'Say hello.' };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const candidate = (text: string, finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }],
});

function setup(respond: (init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = jest.fn((_url: string, init?: RequestInit) => Promise.resolve(respond(init ?? {})));
  const generate = createGeminiClient({
    apiKey: API_KEY,
    model: 'gemini-test-model',
    fetchImpl: (url, init) => fetchImpl(url as string, init),
  });
  return { fetchImpl, generate };
}

async function failure(promise: Promise<unknown>): Promise<AiProviderError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AiProviderError);
  return error as AiProviderError;
}

describe('createGeminiClient', () => {
  it('posts to generateContent with the key in a header (never in the URL) and returns the text', async () => {
    const { fetchImpl, generate } = setup(() => jsonResponse(candidate('Hello, Ana!')));

    await expect(generate(input, new AbortController().signal)).resolves.toBe('Hello, Ana!');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${GEMINI_API_BASE_URL}/models/gemini-test-model:generateContent`);
    expect(url).not.toContain(API_KEY);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': API_KEY });
    expect(JSON.parse(init?.body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'Be brief.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Say hello.' }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('joins text parts and skips thought parts', async () => {
    const { generate } = setup(() =>
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: 'planning…', thought: true }, { text: 'Hello, ' }, { text: 'Ana!' }] },
            finishReason: 'STOP',
          },
        ],
      }),
    );
    await expect(generate(input, new AbortController().signal)).resolves.toBe('Hello, Ana!');
  });

  it.each([400, 403, 429, 500, 503])('reports HTTP %i as http_error without exposing the body', async (status) => {
    const { generate } = setup(() => jsonResponse({ error: { message: `API key ${API_KEY} invalid` } }, status));
    const error = await failure(generate(input, new AbortController().signal));
    expect(error.reason).toBe('http_error');
    expect(error.status).toBe(status);
    expect(error.message).not.toContain(API_KEY);
  });

  it('reports a network failure', async () => {
    const generate = createGeminiClient({
      apiKey: API_KEY,
      model: 'm',
      fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect((await failure(generate(input, new AbortController().signal))).reason).toBe('network');
  });

  it('reports an aborted request as a timeout', async () => {
    const controller = new AbortController();
    const generate = createGeminiClient({
      apiKey: API_KEY,
      model: 'm',
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    const pending = generate(input, controller.signal);
    controller.abort();
    expect((await failure(pending)).reason).toBe('timeout');
  });

  it.each([
    ['non-JSON body', () => new Response('<html>oops</html>', { status: 200 })],
    ['unexpected JSON shape', () => jsonResponse({ candidates: 'nope' })],
  ])('reports a %s as malformed_response', async (_label, respond) => {
    const { generate } = setup(respond);
    expect((await failure(generate(input, new AbortController().signal))).reason).toBe('malformed_response');
  });

  it.each([
    ['a blocked prompt', { promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    ['a safety stop', candidate('partial', 'SAFETY'), 'blocked'],
    ['a token-limit stop', candidate('Hello, An', 'MAX_TOKENS'), 'truncated'],
    ['no candidates', { candidates: [] }, 'empty'],
    ['blank text', candidate('   '), 'empty'],
  ])('reports %s', async (_label, body, reason) => {
    const { generate } = setup(() => jsonResponse(body));
    expect((await failure(generate(input, new AbortController().signal))).reason).toBe(reason);
  });
});
