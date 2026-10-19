import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AI_DAILY_LIMIT, aiCardSchema, aiRequestSchema } from '../../src/shared/schemas.ts';
import { requireUser } from '../auth.ts';
import type { Db } from '../db.ts';
import { HttpError, readJson, sendJson } from '../http.ts';
import { RateLimiter } from '../security.ts';
import { SYSTEM, buildPrompt, cleanOutput } from './prompts.ts';
import { type AiProvider, AiProviderError } from './provider.ts';

export const AI_TIMEOUT_MS = 30_000;
const burst = new RateLimiter(5, 60_000);

const today = () => new Date().toISOString().slice(0, 10);

function used(db: Db, uid: string): number {
  const row = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(uid, today()) as
    { count: number } | undefined;
  return row?.count ?? 0;
}

interface AiCtx {
  req: import('node:http').IncomingMessage;
  res: import('node:http').ServerResponse;
  db: Db;
  ai: AiProvider | null;
  log?: ((message: string) => void) | undefined;
}

export function aiStatus(ctx: AiCtx) {
  const uid = requireUser(ctx.db, ctx.req);
  sendJson(ctx.res, 200, { enabled: ctx.ai !== null, limit: AI_DAILY_LIMIT, used: used(ctx.db, uid) });
}

/**
 * Runs one AI action for the signed-in student. Enforces a daily quota and a
 * burst limit, caps input and output, times out, and logs metadata only.
 */
export async function aiRun(ctx: AiCtx) {
  const uid = requireUser(ctx.db, ctx.req);
  const body = await readJson(ctx.req, aiRequestSchema, 2_200_000);
  if (!ctx.ai) throw new HttpError(503, 'ai-disabled');
  if (!burst.take(uid)) throw new HttpError(429, 'rate-limited');
  // Reserve one use before calling the provider (refunded if the provider fails).
  const reserved = ctx.db
    .prepare(
      `INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 WHERE count < ?`,
    )
    .run(uid, today(), AI_DAILY_LIMIT);
  if (reserved.changes === 0) throw new HttpError(429, 'quota');

  const started = Date.now();
  const signal = AbortSignal.any([AbortSignal.timeout(AI_TIMEOUT_MS), abortOnClose(ctx.req)]);
  let status = 'ok';
  let detail: string | undefined;
  let tokens: { in?: number | undefined; out?: number | undefined } = {};
  try {
    const out = await ctx.ai.generate({
      system: SYSTEM,
      prompt: buildPrompt(body),
      imagePng: body.image?.slice('data:image/png;base64,'.length),
      json: body.action === 'flashcards',
      maxOutputTokens: body.action === 'flashcards' ? 1500 : 1024,
      signal,
    });
    tokens = { in: out.inputTokens, out: out.outputTokens };
    if (body.action === 'flashcards') {
      const cards = parseCards(out.text);
      if (cards.length === 0) throw new AiProviderError('provider');
      sendJson(ctx.res, 200, { text: '', cards });
    } else sendJson(ctx.res, 200, { text: cleanOutput(out.text) });
  } catch (error) {
    ctx.db
      .prepare('UPDATE ai_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND day = ?')
      .run(uid, today());
    status = error instanceof AiProviderError ? error.code : 'error';
    if (error instanceof AiProviderError) detail = error.detail;
    if (error instanceof AiProviderError)
      throw new HttpError(
        error.code === 'timeout' ? 504 : error.code === 'blocked' ? 422 : 502,
        `ai-${error.code}`,
      );
    throw error;
  } finally {
    // Metadata only: never the prompt or the answer.
    const hashed = createHash('sha256').update(uid).digest('hex').slice(0, 12);
    ctx.log?.(
      JSON.stringify({
        event: 'ai',
        user: hashed,
        action: body.action,
        status,
        detail,
        ms: Date.now() - started,
        tokensIn: tokens.in,
        tokensOut: tokens.out,
      }),
    );
  }
}

function abortOnClose(req: import('node:http').IncomingMessage): AbortSignal {
  const controller = new AbortController();
  req.socket.once('close', () => controller.abort());
  return controller.signal;
}

/** The model's JSON is untrusted: parse defensively and keep at most 10 valid cards. */
function parseCards(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  return z
    .array(z.unknown())
    .catch([])
    .parse(raw)
    .flatMap((c) => {
      const parsed = aiCardSchema.safeParse(c);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 10);
}
