import type { z } from 'zod';

export { PASSWORD_MIN, loginSchema, signUpSchema } from '../../shared/schemas';

/** Returns the first message key per field, for inline errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (!(field in out)) out[field] = issue.message;
  }
  return out;
}
