import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';

describe('authErrorMessage', () => {
  it('uses one message for wrong email or wrong password (no account enumeration)', () => {
    for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      expect(authErrorMessage(code, 'signIn')).toBe('auth.error.invalidCredentials');
    }
  });
  it('stays silent when the user closes the popup', () => {
    expect(authErrorMessage('auth/popup-closed-by-user', 'signIn')).toBeNull();
  });
  it('explains guest-upgrade conflicts', () => {
    expect(authErrorMessage('auth/email-already-in-use', 'link')).toBe('auth.error.guestLinkConflict');
    expect(authErrorMessage('auth/credential-already-in-use', 'link')).toBe('auth.error.guestLinkConflict');
    expect(authErrorMessage('auth/email-already-in-use', 'signUp')).toBe('auth.error.emailInUse');
  });
  it('maps configuration-not-found error', () => {
    expect(authErrorMessage('auth/configuration-not-found', 'signIn')).toBe(
      'auth.error.configurationNotFound',
    );
    expect(authErrorMessage('auth/invalid-api-key', 'signIn')).toBe('auth.error.invalidApiKey');
  });
  it('maps server codes to friendly messages', () => {
    expect(authErrorMessage('invalid-credentials', 'signIn')).toBe('auth.error.invalidCredentials');
    expect(authErrorMessage('username-taken', 'signUp')).toBe('auth.error.usernameTaken');
    expect(authErrorMessage('rate-limited', 'signIn')).toBe('auth.error.tooManyRequests');
    expect(authErrorMessage('network', 'other')).toBe('auth.error.network');
  });
  it('falls back to a generic message', () => {
    expect(authErrorMessage(undefined, 'other')).toBe('auth.error.generic');
    expect(authErrorMessage('auth/something-new', 'other')).toBe('auth.error.generic');
  });
});
