import { useSignedInUser } from '../../app/session/SessionProvider';
import { useSignOut } from '../auth/useSignOut';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Wordmark } from '../../ui/Wordmark';

/** Temporary signed-in start page; replaced by the app shell + dashboard in the next modules. */
export function HomePage() {
  const user = useSignedInUser();
  const signOut = useSignOut();
  const name = user.isGuest ? t('home.guestName') : (user.displayName ?? user.email ?? '');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-6 px-6">
      <Wordmark />
      <h1 className="text-2xl font-bold text-ink">{t('home.signedInAs', { name })}</h1>
      <p className="text-base text-ink-muted">{t('home.nextModule')}</p>
      <Button variant="secondary" icon="logOut" loading={signOut.busy} onClick={() => void signOut.start()}>
        {t('auth.signOut')}
      </Button>
      {signOut.dialog}
    </main>
  );
}
