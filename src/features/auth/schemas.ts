import { z } from 'zod';

export const PASSWORD_MIN = 8;

const email = z.string().trim().toLowerCase().max(254).email('auth.validation.email');
const password = z
  .string()
  .min(PASSWORD_MIN, 'auth.validation.passwordLength')
  .max(128, 'auth.validation.passwordLength')
  .regex(/[A-Za-z]/, 'auth.validation.passwordMix')
  .regex(/[0-9]/, 'auth.validation.passwordMix');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'auth.validation.passwordRequired').max(128),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'auth.validation.nameRequired').max(60, 'auth.validation.nameLength'),
  email,
  password,
});

export const forgotSchema = z.object({ email });

/** Returns the first message key per field, for inline errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (!(field in out)) out[field] = issue.message;
  }
  return out;
}
