import { t } from '../i18n/i18n';
import { Button } from './Button';
import { Wordmark } from './Wordmark';

/** Shown when the local AKSHAR server can't be reached at all. */
export function ServerDown() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <Wordmark />
      <h1 role="alert" className="text-2xl font-bold text-ink">
        {t('server.downTitle')}
      </h1>
      <p className="text-base text-ink-muted">
        {t('server.downBody')} <code className="font-mono text-ink">npm start</code>
      </p>
      <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
    </main>
  );
}
