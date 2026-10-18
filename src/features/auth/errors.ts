import type { MessageKey } from '../../i18n/i18n';

/**
 * Maps a Firebase Auth error code to a friendly message key. Returns null when
 * the error needs no message (the user closed the popup themselves). Messages
 * never reveal whether a given email has an account, except on sign-up where
 * "email already in use" is unavoidable.
 */
export function authErrorMessage(
  code: string | undefined,
  context: 'signIn' | 'signUp' | 'link' | 'other',
): MessageKey | null {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
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
      return 'auth.error.tooManyRequests';
    case 'auth/network-request-failed':
      return 'auth.error.network';
    case 'auth/popup-blocked':
      return 'auth.error.popupBlocked';
    case 'auth/user-disabled':
      return 'auth.error.disabled';
    case 'auth/requires-recent-login':
      return 'auth.error.recentLogin';
    default:
      return 'auth.error.generic';
  }
}
