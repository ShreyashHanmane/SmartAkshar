import { useState } from 'react';
import { signOutAndClear } from '../../data/auth';

/** Sign-out with local cleanup, then a full page load so no in-memory state survives. */
export function useSignOut() {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await signOutAndClear();
    } finally {
      window.location.assign('/login');
    }
  }

  return { start, busy, dialog: null };
}
