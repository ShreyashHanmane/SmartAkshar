import { t } from '../i18n/i18n';
import { Spinner } from './Spinner';

export function FullPageLoader() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-ink-muted">
      <Spinner size={22} />
      <span className="text-sm">{t('common.loading')}</span>
    </div>
  );
}
