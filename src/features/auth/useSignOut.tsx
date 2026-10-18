import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutAndClear } from '../../data/auth';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useSession } from '../../app/session/SessionProvider';

/**
 * Sign-out with local data cleanup, then a full page load so no in-memory state
 * survives. Guests are warned first: their data cannot be recovered after signing out.
 */
export function useSignOut() {
  const session = useSession();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isGuest = session.status === 'signedIn' && session.user.isGuest;

  async function perform() {
    setBusy(true);
    try {
      await signOutAndClear();
    } finally {
      window.location.assign('/login');
    }
  }

  async function start() {
    if (isGuest) setConfirming(true);
    else await perform();
  }

  const dialog = (
    <Dialog
      open={confirming}
      title={t('auth.signOut.guestTitle')}
      onClose={() => setConfirming(false)}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirming(false);
              navigate('/signup');
            }}
          >
            {t('auth.signOut.keep')}
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void perform()}>
            {t('auth.signOut.guestConfirm')}
          </Button>
        </>
      }
    >
      {t('auth.signOut.guestBody')}
    </Dialog>
  );

  return { start, busy, dialog };
}
