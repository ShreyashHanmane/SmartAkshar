import { t } from '../../i18n/i18n';
import { Wordmark } from '../../ui/Wordmark';

/** Temporary start page for the foundation module; replaced by auth + dashboard. */
export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-6 px-6">
      <Wordmark />
      <p className="rounded-xl border border-line bg-surface p-4 text-base text-ink-muted">
        {t('home.setupNotice')}
      </p>
    </main>
  );
}
