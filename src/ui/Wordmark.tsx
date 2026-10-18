import { t } from '../i18n/i18n';

/**
 * Text-only wordmark. The original Figma logo mark is added here once its SVG
 * is exported into the repo (it must not be redrawn — CLAUDE.md §1).
 */
export function Wordmark() {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-lg font-bold tracking-[0.12em] text-ink">{t('app.name')}</span>
      <span className="text-xs font-medium tracking-[0.08em] text-ink-muted uppercase">
        {t('app.tagline')}
      </span>
    </div>
  );
}
