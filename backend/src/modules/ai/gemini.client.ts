import { z } from 'zod';

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Why a generation attempt failed. Safe to log: it never contains provider text or secrets. */
export type AiFailureReason =
  | 'timeout'
  | 'network'
  | 'http_error'
  | 'malformed_response'
  | 'blocked'
  | 'truncated'
  | 'empty';

export class AiProviderError extends Error {
  constructor(
    public readonly reason: AiFailureReason,
    /** Provider HTTP status, for `http_error` only. */
    public readonly status?: number,
  ) {
    super(`AI provider failure: ${reason}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'AiProviderError';
  }
}

export type GenerateTextInput = {
  /** Fixed instructions written by us. */
  system: string;
  /** Per-request content; may contain user-supplied data. */
  prompt: string;
};

/** Returns the generated text, or throws AiProviderError. Must stop when `signal` aborts. */
export type TextGenerator = (input: GenerateTextInput, signal: AbortSignal) => Promise<string>;

/** Upper bound on generated tokens; the service also caps the message length in characters. */
const MAX_OUTPUT_TOKENS = 512;

const BLOCKING_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'LANGUAGE',
  'OTHER',
]);

// Only the fields we use; anything else in the response is ignored.
const generateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export type GeminiClientOptions = {
  apiKey: string;
  model: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

/**
 * Minimal client for the Gemini `generateContent` REST endpoint, using the
 * built-in fetch instead of an SDK dependency. The API key travels in the
 * `x-goog-api-key` header, never in the URL, so it cannot leak through URL logging.
 * Provider response bodies are never logged or returned: they may echo the prompt.
 */
export function createGeminiClient({
  apiKey,
  model,
  fetchImpl = (input, init) => fetch(input, init),
  baseUrl = GEMINI_API_BASE_URL,
}: GeminiClientOptions): TextGenerator {
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

  return async ({ system, prompt }, signal) => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal,
      });
    } catch {
      throw new AiProviderError(signal.aborted ? 'timeout' : 'network');
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AiProviderError('http_error', response.status);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AiProviderError(signal.aborted ? 'timeout' : 'malformed_response');
    }

    const parsed = generateContentResponseSchema.safeParse(json);
    if (!parsed.success) throw new AiProviderError('malformed_response');

    const { candidates, promptFeedback } = parsed.data;
    if (promptFeedback?.blockReason) throw new AiProviderError('blocked');

    const candidate = candidates?.[0];
    if (!candidate) throw new AiProviderError('empty');
    if (candidate.finishReason && BLOCKING_FINISH_REASONS.has(candidate.finishReason)) {
      throw new AiProviderError('blocked');
    }
    // A message cut off mid-sentence is worse than the prepared fallback.
    if (candidate.finishReason === 'MAX_TOKENS') throw new AiProviderError('truncated');

    const text = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (!text.trim()) throw new AiProviderError('empty');
    return text;
  };
}
