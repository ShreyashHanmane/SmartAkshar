import { describe, expect, it } from 'vitest';
import { isMessageKey } from '../../i18n/i18n';
import { fieldErrors, loginSchema, signUpSchema } from './schemas';

describe('auth schemas', () => {
  it('normalizes email', () => {
    expect(loginSchema.parse({ email: '  Asha@Example.COM ', password: 'x' }).email).toBe('asha@example.com');
  });

  it('requires a password with a letter and a number, 8+ chars', () => {
    const ok = signUpSchema.safeParse({ name: 'Asha', email: 'a@b.co', password: 'study1234' });
    expect(ok.success).toBe(true);
    for (const password of ['short1', 'onlyletters', '12345678']) {
      expect(signUpSchema.safeParse({ name: 'Asha', email: 'a@b.co', password }).success).toBe(false);
    }
  });

  it('reports one translatable message per field', () => {
    const result = signUpSchema.safeParse({ name: ' ', email: 'nope', password: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
    for (const key of Object.values(errors)) expect(isMessageKey(key)).toBe(true);
  });
});
