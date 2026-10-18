import { type AiInput, type AiOutput, type AiProvider, AiProviderError } from './provider.ts';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Google Gemini over plain HTTPS (no SDK). The key stays in the server
 * process; it is sent only to Google in a header, never logged or returned.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private key: string;
  private model: string;

  constructor(key: string, model: string) {
    this.key = key;
    this.model = model;
  }

  async generate(input: AiInput): Promise<AiOutput> {
    const parts: Record<string, unknown>[] = [{ text: input.prompt }];
    if (input.imagePng) parts.push({ inlineData: { mimeType: 'image/png', data: input.imagePng } });
    const body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: input.maxOutputTokens,
        ...(input.json
          ? {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
                  required: ['front', 'back'],
                },
              },
            }
          : {}),
      },
    };
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
          body: JSON.stringify(body),
          signal: input.signal,
        },
      );
    } catch (error) {
      if (input.signal.aborted) throw new AiProviderError('timeout');
      throw new AiProviderError(
        error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider',
      );
    }
    if (!res.ok) throw new AiProviderError('provider');
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new AiProviderError('blocked');
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new AiProviderError('blocked');
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new AiProviderError('provider');
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }
}
