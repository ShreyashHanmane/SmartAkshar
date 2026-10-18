import { useNewNotebook } from '../../features/notebooks/NewNotebookProvider';
import { t } from '../../i18n/i18n';
import { Icon } from '../../ui/Icon';

/** "+ New notebook" in the sidebar, and the floating "+ New" button on mobile. */
export function NewNotebookButton({ variant }: { variant: 'sidebar' | 'fab' }) {
  const open = useNewNotebook();
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label={variant === 'fab' ? t('notebooks.new') : undefined}
      className={
        variant === 'sidebar'
          ? 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:brightness-110'
          : 'fixed right-4 bottom-20 z-30 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-lg md:hidden'
      }
    >
      <Icon name="plus" size={18} />
      <span>{variant === 'fab' ? t('common.new') : t('notebooks.new')}</span>
    </button>
  );
}
