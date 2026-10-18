import { t } from '../../i18n/i18n';
import { Icon } from '../../ui/Icon';

/**
 * "+ New notebook". Notebook creation is built in the Dashboard module; until
 * then the control is visibly disabled with a "Coming soon" tooltip (no dead action).
 */
export function NewNotebookButton({ variant }: { variant: 'sidebar' | 'fab' }) {
  const common = 'inline-flex items-center justify-center gap-2 font-semibold cursor-not-allowed opacity-60';
  const label = t('notebooks.new');
  return (
    <button
      type="button"
      aria-disabled="true"
      title={t('common.comingSoon')}
      aria-describedby="coming-soon-hint"
      className={
        variant === 'sidebar'
          ? `${common} min-h-11 w-full rounded-lg bg-primary px-4 text-sm text-on-primary`
          : `${common} fixed right-4 bottom-20 z-30 min-h-14 rounded-full bg-primary px-5 text-sm text-on-primary shadow-lg md:hidden`
      }
      aria-label={variant === 'fab' ? label : undefined}
    >
      <Icon name="plus" size={18} />
      <span>{variant === 'fab' ? t('common.new') : label}</span>
      <span id="coming-soon-hint" className="sr-only">
        {t('common.comingSoon')}
      </span>
    </button>
  );
}
