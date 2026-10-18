import { describe, expect, it } from 'vitest';
import { isMessageKey } from '../../i18n/i18n';
import { fieldErrors, signUpSchema } from './schemas';

describe('auth schemas', () => {
  it('accepts valid accounts and trims usernames', () => {
    expect(signUpSchema.parse({ name: 'Asha', username: ' asha_01 ', password: 'study1234' }).username).toBe(
      'asha_01',
    );
  });

  it('requires 8+ characters with a letter and a number', () => {
    for (const password of ['short1', 'onlyletters', '12345678'])
      expect(signUpSchema.safeParse({ name: 'Asha', username: 'asha', password }).success).toBe(false);
  });

  it('rejects odd usernames', () => {
    for (const username of ['ab', 'has space', 'émoji', 'x'.repeat(33)])
      expect(signUpSchema.safeParse({ name: 'A', username, password: 'study1234' }).success).toBe(false);
  });

  it('reports one translatable message per field', () => {
    const result = signUpSchema.safeParse({ name: ' ', username: '!', password: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(['name', 'password', 'username']);
    for (const key of Object.values(errors)) expect(isMessageKey(key)).toBe(true);
  });
});
