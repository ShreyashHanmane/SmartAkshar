import type { ReactNode } from 'react';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { useOnline } from '../../ui/useOnline';
import { Wordmark } from '../../ui/Wordmark';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const online = useOnline();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>
        <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          {!online && (
            <div className="mt-4">
              <Alert tone="offline">{t('common.offline')}</Alert>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      {t('common.or')}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
