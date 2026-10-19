import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini.ts';
import { AiProviderError } from './provider.ts';

const input = () => ({ system: 'S', prompt: 'P', maxOutputTokens: 100, signal: new AbortController().signal });

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function failure(p: Promise<unknown>): Promise<AiProviderError> {
  try {
    await p;
  } catch (error) {
    if (error instanceof AiProviderError) return error;
    throw error;
  }
  throw new Error('expected an AiProviderError');
}

afterEach(() => vi.unstubAllGlobals());

describe('GeminiProvider', () => {
  it('turns thinking down so it cannot eat the whole output budget', async () => {
    const ok = { candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] };
    for (const [model, expected] of [
      ['gemini-3.5-flash', { thinkingLevel: 'minimal' }],
      ['gemini-2.5-flash', { thinkingBudget: 0 }],
    ] as const) {
      const fn = stubFetch(200, ok);
      expect((await new GeminiProvider('k', model).generate(input())).text).toBe('hi');
      const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(JSON.parse(init.body as string).generationConfig.thinkingConfig).toEqual(expected);
    }
  });

  it('reports the upstream status (code name only) for retired models', async () => {
    stubFetch(404, { error: { status: 'NOT_FOUND', message: 'models/x is no longer available' } });
    const err = await failure(new GeminiProvider('k', 'x').generate(input()));
    expect([err.code, err.detail]).toEqual(['provider', 'http-404 NOT_FOUND']);
  });

  it('reports why an answer came back empty', async () => {
    stubFetch(200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] });
    const err = await failure(new GeminiProvider('k', 'gemini-3.5-flash').generate(input()));
    expect([err.code, err.detail]).toEqual(['provider', 'empty MAX_TOKENS']);
  });
});
