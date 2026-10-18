import { useState } from 'react';
import { getSyncSummary } from '../../app/save/pending';
import { signOutAndClear } from '../../data/auth';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

/**
 * Sign-out with local cleanup, then a full page load so no in-memory state
 * survives. If some changes haven't reached the server yet, asks first.
 */
export function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function signOutNow() {
    setConfirming(false);
    setBusy(true);
    try {
      await signOutAndClear();
    } finally {
      window.location.assign('/login');
    }
  }

  async function start() {
    if (getSyncSummary().pending > 0) setConfirming(true);
    else await signOutNow();
  }

  const dialog = confirming ? (
    <Dialog
      open
      title={t('auth.signOutUnsavedTitle')}
      onClose={() => setConfirming(false)}
      actions={
        <>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('auth.staySignedIn')}
          </Button>
          <Button variant="danger" onClick={() => void signOutNow()}>
            {t('auth.signOutAnyway')}
          </Button>
        </>
      }
    >
      {t('auth.signOutUnsaved')}
    </Dialog>
  ) : null;

  return { start, busy, dialog };
}
