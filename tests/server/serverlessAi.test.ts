import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import handler from '../../api/index.ts';
import { aiResponseSchema, aiStatusSchema } from '../../src/shared/schemas.ts';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

const nativeFetch = globalThis.fetch;

function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { 'X-Akshar': '1', 'X-Akshar-User': 'test-student-1' },
) {
  return nativeFetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : null,
  });
}

function stubGemini(status: number, data: unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify(data), { status });
    }
    return nativeFetch(input, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('Serverless AI endpoints (api/index.ts)', () => {
  it('GET /api/ai/status reports enabled=false when key is missing and matches schema', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const res = await request('GET', '/api/ai/status');
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aiStatusSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ enabled: false, limit: 20, used: 0 });
  });

  it('GET /api/ai/status reports enabled=true when key is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const res = await request('GET', '/api/ai/status');
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aiStatusSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.enabled).toBe(true);
    expect(parsed.data?.limit).toBe(20);
  });

  it('POST /api/ai/run rejects requests without CSRF or auth', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    // Missing X-Akshar
    const noCsrf = await request('POST', '/api/ai/run', { action: 'explain', text: 'gravity' }, {
      'X-Akshar-User': 'u1',
    });
    expect(noCsrf.status).toBe(403);

    // Missing X-Akshar-User
    const noAuth = await request('POST', '/api/ai/run', { action: 'explain', text: 'gravity' }, {
      'X-Akshar': '1',
    });
    expect(noAuth.status).toBe(401);
  });

  it('POST /api/ai/run returns 503 when key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const res = await request('POST', '/api/ai/run', { action: 'explain', text: 'gravity' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ai-disabled' });
  });

  it('POST /api/ai/run validates input payload', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    // Invalid action
    const invalidAction = await request('POST', '/api/ai/run', { action: 'invalid-action', text: 'x' });
    expect(invalidAction.status).toBe(400);

    // Missing text for explain
    const missingText = await request('POST', '/api/ai/run', { action: 'explain' });
    expect(missingText.status).toBe(400);

    // Text exceeds max limit
    const hugeText = await request('POST', '/api/ai/run', { action: 'explain', text: 'a'.repeat(12_001) });
    expect(hugeText.status).toBe(400);
  });

  it('POST /api/ai/run returns valid response matching aiResponseSchema on success', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const mockResponse = {
      candidates: [
        {
          content: { parts: [{ text: 'Gravity is the force that attracts two bodies toward each other.' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 12 },
    };
    stubGemini(200, mockResponse);

    const res = await request('POST', '/api/ai/run', { action: 'explain', text: 'What is gravity?' });
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aiResponseSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.text).toContain('Gravity is the force');
  });

  it('POST /api/ai/run parses flashcards JSON correctly', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify([
                  { front: 'What is F in F=ma?', back: 'Force' },
                  { front: 'What is m in F=ma?', back: 'Mass' },
                ]),
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    };
    stubGemini(200, mockResponse);

    const res = await request('POST', '/api/ai/run', {
      action: 'flashcards',
      text: 'Newton second law relates force, mass, and acceleration.',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aiResponseSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.cards).toEqual([
      { front: 'What is F in F=ma?', back: 'Force' },
      { front: 'What is m in F=ma?', back: 'Mass' },
    ]);
  });

  it('POST /api/ai/run refunds quota on provider error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    stubGemini(500, { error: { status: 'INTERNAL' } });

    const uid = 'refund-student';
    const res = await request(
      'POST',
      '/api/ai/run',
      { action: 'explain', text: 'Newton laws' },
      { 'X-Akshar': '1', 'X-Akshar-User': uid },
    );
    expect(res.status).toBe(502);

    // Verify quota was refunded
    const statusRes = await request('GET', '/api/ai/status', undefined, {
      'X-Akshar': '1',
      'X-Akshar-User': uid,
    });
    const statusJson = await statusRes.json();
    expect(statusJson.used).toBe(0);
  });
});
