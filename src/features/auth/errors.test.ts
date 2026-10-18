import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';

describe('authErrorMessage', () => {
  it('maps server codes to friendly messages', () => {
    expect(authErrorMessage('invalid-credentials', 'signIn')).toBe('auth.error.invalidCredentials');
    expect(authErrorMessage('username-taken', 'signUp')).toBe('auth.error.usernameTaken');
    expect(authErrorMessage('rate-limited', 'signIn')).toBe('auth.error.tooManyRequests');
    expect(authErrorMessage('network', 'other')).toBe('auth.error.network');
    expect(authErrorMessage(undefined, 'other')).toBe('auth.error.generic');
  });
});
