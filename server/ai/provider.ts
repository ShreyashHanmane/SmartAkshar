/** One interface for the AI provider so it can be swapped (CLAUDE.md §7.3). */
export interface AiInput {
  /** Fixed instructions; never contains student material. */
  system: string;
  /** Task text plus student material (wrapped and marked as data). */
  prompt: string;
  /** Optional PNG of selected handwriting (base64, no data: prefix). */
  imagePng?: string | undefined;
  /** Ask for JSON matching a simple array-of-cards schema. */
  json?: boolean;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface AiOutput {
  text: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}

export interface AiProvider {
  readonly name: string;
  generate(input: AiInput): Promise<AiOutput>;
}

export class AiProviderError extends Error {
  code: 'timeout' | 'blocked' | 'provider';
  /** Short, content-free reason for the logs (e.g. "http-404 NOT_FOUND", "empty MAX_TOKENS"). */
  detail: string | undefined;
  constructor(code: 'timeout' | 'blocked' | 'provider', detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}
