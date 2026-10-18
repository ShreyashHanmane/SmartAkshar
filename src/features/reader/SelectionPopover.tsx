import { type MessageKey, t } from '../../i18n/i18n';
import { Icon, type IconName } from '../../ui/Icon';

export interface PopoverAction {
  label: MessageKey;
  icon: IconName;
  onSelect?: () => void;
  /** Shown but not yet available (with a "Coming soon" tooltip). */
  comingSoon?: boolean;
  danger?: boolean;
}

/** Floating menu above a text selection (positioned in the pane's coordinates). */
export function SelectionPopover({
  at,
  bounds,
  actions,
  label,
}: {
  at: { x: number; top: number; bottom: number };
  bounds: { width: number; height: number };
  actions: PopoverAction[];
  label: string;
}) {
  const width = Math.min(520, bounds.width - 16);
  const left = Math.max(8, Math.min(bounds.width - width - 8, at.x - width / 2));
  const above = at.top - 64;
  const top = above >= 8 ? above : Math.min(bounds.height - 64, at.bottom + 8);
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="absolute z-30 flex flex-wrap items-center justify-center gap-1"
      style={{ left, top, width }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            aria-disabled={a.comingSoon || undefined}
            title={a.comingSoon ? t('common.comingSoon') : undefined}
            onClick={() => {
              if (!a.comingSoon) a.onSelect?.();
            }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold hover:bg-primary-soft ${a.danger ? 'text-danger' : 'text-ink'} ${a.comingSoon ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <Icon name={a.icon} size={18} /> {t(a.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
