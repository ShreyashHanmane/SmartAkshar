import { type AiInput, type AiOutput, type AiProvider, AiProviderError } from './provider.ts';

interface GeminiError {
  error?: { status?: string };
}

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
        // Thinking tokens count against maxOutputTokens; left on, they can use
        // the whole budget and return no text. These tasks don't need it.
        thinkingConfig: this.model.startsWith('gemini-2')
          ? { thinkingBudget: 0 }
          : { thinkingLevel: 'minimal' },
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
      if (error instanceof Error && error.name === 'TimeoutError') throw new AiProviderError('timeout');
      throw new AiProviderError('provider', 'network');
    }
    if (!res.ok) {
      // Google's status code name only (e.g. NOT_FOUND), never the message body.
      const err = (await res.json().catch(() => ({}))) as GeminiError;
      const reason = /^[A-Z_]{1,40}$/.test(err.error?.status ?? '') ? ` ${err.error?.status}` : '';
      throw new AiProviderError('provider', `http-${res.status}${reason}`);
    }
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new AiProviderError('blocked');
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new AiProviderError('blocked');
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new AiProviderError('provider', `empty ${candidate?.finishReason ?? 'no-candidate'}`);
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }
}
