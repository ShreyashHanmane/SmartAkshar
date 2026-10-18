import { useSignedInUser } from '../../app/session/SessionProvider';
import { t } from '../../i18n/i18n';
import { SearchBox } from '../search/SearchBox';

/** Temporary dashboard: greeting + global search. The full dashboard is built in Module 3. */
export function HomePage() {
  const user = useSignedInUser();
  const name = user.isGuest ? t('home.guestName') : (user.displayName ?? user.email ?? '');

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-xl">
        <SearchBox />
      </div>
      <h1 className="text-3xl font-bold text-ink">{t('home.signedInAs', { name })}</h1>
    </div>
  );
}
