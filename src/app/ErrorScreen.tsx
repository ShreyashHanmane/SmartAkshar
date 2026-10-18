import { t } from '../i18n/i18n';
import { Wordmark } from '../ui/Wordmark';

/** Friendly full-page error. Never shows stack traces or error details to users. */
export function ErrorScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <Wordmark />
      <h1 className="text-2xl font-bold text-ink">{t('error.title')}</h1>
      <p className="text-base text-ink-muted">{t('error.body')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary"
      >
        {t('error.reload')}
      </button>
    </main>
  );
}
