import { Link } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { Wordmark } from '../ui/Wordmark';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-6">
      <Wordmark />
      <h1 className="text-2xl font-bold text-ink">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
      >
        {t('notFound.home')}
      </Link>
    </main>
  );
}
