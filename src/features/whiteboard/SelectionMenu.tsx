import { useLayoutEffect, useRef, useState } from 'react';
import { type MessageKey, t } from '../../i18n/i18n';
import { Icon, type IconName } from '../../ui/Icon';

interface Props {
  /** Selection box in screen pixels: centre x, top and bottom edges. */
  anchor: { x: number; top: number; bottom: number };
  bounds: { width: number; height: number };
  count: number;
  onMove: () => void;
  onErase: () => void;
  onDone: () => void;
}

const AI_ACTIONS: { label: MessageKey; icon: IconName }[] = [
  { label: 'whiteboard.ai.convert', icon: 'file' },
  { label: 'whiteboard.ai.explain', icon: 'sparkle' },
  { label: 'whiteboard.ai.translate', icon: 'sparkle' },
];

/** Floating menu for a lasso selection: Move, Erase, and the AI actions. */
export function SelectionMenu({ anchor, bounds, count, onMove, onErase, onDone }: Props) {
  const [hint, setHint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(56);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const width = Math.min(560, bounds.width - 16);
  const left = Math.max(8, Math.min(bounds.width - width - 8, anchor.x - width / 2));
  // Never cover the selection: above it when there is room, otherwise below.
  const above = anchor.top - height - 8;
  const top = above >= 8 ? above : Math.min(bounds.height - height - 8, anchor.bottom + 8);
  const btn =
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-primary-soft';

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('whiteboard.selection', { count })}
      className="absolute z-20 flex flex-col gap-1"
      style={{ left, top, maxWidth: width }}
    >
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
        <button
          type="button"
          className={btn}
          onClick={() => {
            setHint(true);
            onMove();
          }}
        >
          <Icon name="arrowRight" size={18} /> {t('whiteboard.move')}
        </button>
        <button type="button" className={`${btn} text-danger`} onClick={onErase}>
          <Icon name="trash" size={18} /> {t('whiteboard.erase')}
        </button>
        {AI_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            aria-disabled="true"
            title={t('common.comingSoon')}
            className={`${btn} cursor-not-allowed opacity-60`}
          >
            <Icon name={a.icon} size={18} /> {t(a.label)}
          </button>
        ))}
        <button type="button" className={btn} onClick={onDone} aria-label={t('whiteboard.clearSelection')}>
          <Icon name="x" size={18} />
        </button>
      </div>
      {hint && (
        <p role="status" className="rounded-lg bg-ink px-3 py-1.5 text-xs text-canvas">
          {t('whiteboard.moveHint')}
        </p>
      )}
    </div>
  );
}
