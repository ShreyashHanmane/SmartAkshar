import { type MessageKey, t } from '../../i18n/i18n';
import { PageHeader } from './PageHeader';

/** Honest placeholder for areas built in later modules (listed in docs/AUDIT.md). */
export function ComingSoonPage({ title }: { title: MessageKey }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(title)} />
      <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-base text-ink-muted">
        {t('common.comingSoonBody')}
      </p>
    </div>
  );
}
