import { type AiRequest, type AiResponse, type AiStatus, aiResponseSchema, aiStatusSchema } from '../shared/schemas';
import { ApiError, getJson, request } from './api';

export type { AiRequest, AiResponse, AiStatus };

export function getAiStatus(): Promise<AiStatus> {
  return getJson('/api/ai/status', aiStatusSchema);
}

/** Runs one AI action through the local server (the browser never talks to the provider). */
export async function runAi(body: AiRequest, signal?: AbortSignal): Promise<AiResponse> {
  const res = await request('POST', '/api/ai/run', { json: body, ...(signal ? { signal } : {}) });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, 'network');
  }
  const parsed = aiResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(res.status, 'invalid');
  }
  return parsed.data;
}
