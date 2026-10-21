import type { MessageKey } from '../../i18n/i18n';

/**
 * Maps a Firebase Auth or API error code to a friendly message key. Returns null when
 * the error needs no message (e.g. the user closed the popup themselves). Messages
 * never reveal whether a given email has an account, except on sign-up where
 * "email already in use" is unavoidable.
 */
export function authErrorMessage(
  code: string | undefined,
  context: 'signIn' | 'signUp' | 'link' | 'other' = 'other',
): MessageKey | null {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
    case 'invalid-credentials':
      return 'auth.error.invalidCredentials';
    case 'auth/invalid-email':
      return 'auth.error.invalidEmail';
    case 'auth/email-already-in-use':
      return context === 'link' ? 'auth.error.guestLinkConflict' : 'auth.error.emailInUse';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'auth.error.guestLinkConflict';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'auth.error.weakPassword';
    case 'auth/too-many-requests':
    case 'rate-limited':
      return 'auth.error.tooManyRequests';
    case 'auth/network-request-failed':
    case 'network':
      return 'auth.error.network';
    case 'auth/popup-blocked':
      return 'auth.error.popupBlocked';
    case 'auth/user-disabled':
      return 'auth.error.disabled';
    case 'auth/configuration-not-found':
      return 'auth.error.configurationNotFound';
    case 'auth/operation-not-allowed':
      return 'auth.error.operationNotAllowed';
    case 'auth/unauthorized-domain':
      return 'auth.error.unauthorizedDomain';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'auth.error.invalidApiKey';
    case 'auth/requires-recent-login':
      return 'auth.error.recentLogin';
    case 'username-taken':
      return 'auth.error.usernameTaken';
    case 'invalid':
      return 'auth.error.invalid';
    default:
      return 'auth.error.generic';
  }
}
