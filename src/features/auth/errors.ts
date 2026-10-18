import type { MessageKey } from '../../i18n/i18n';

/** Maps a local-server error code to a friendly message key (null: say nothing). */
export function authErrorMessage(
  code: string | undefined,
  _context: 'signIn' | 'signUp' | 'other',
): MessageKey | null {
  switch (code) {
    case 'invalid-credentials':
      return 'auth.error.invalidCredentials';
    case 'username-taken':
      return 'auth.error.usernameTaken';
    case 'rate-limited':
      return 'auth.error.tooManyRequests';
    case 'network':
      return 'auth.error.network';
    case 'invalid':
      return 'auth.error.invalid';
    default:
      return 'auth.error.generic';
  }
}
