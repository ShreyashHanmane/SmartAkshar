import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { type MessageKey, t } from '../../i18n/i18n';
import { Icon, type IconName } from '../../ui/Icon';
import type { FontKind, ShapeKind } from './model';
import { PAPER_BACKGROUNDS, PAPER_STYLES, type PaperBackground, type PaperStyle } from './paper';
import { FONT_FAMILY } from './render';
import type { ToolName, ToolState } from './WhiteboardCanvas';

export type Dock = 'left' | 'right' | 'bottom';

/** Ink swatches from the approved design (document colours, not UI tokens). */
export const INK_COLORS = [
  { value: '#0f2a4a', label: 'whiteboard.color.navy' },
  { value: '#1270c4', label: 'whiteboard.color.blue' },
  { value: '#38a3f1', label: 'whiteboard.color.sky' },
  { value: '#c22a2a', label: 'whiteboard.color.red' },
  { value: '#1f8a3a', label: 'whiteboard.color.green' },
] as const satisfies readonly { value: string; label: MessageKey }[];

const TOOLS: { tool: ToolName; icon: IconName; label: MessageKey; key: string }[] = [
  { tool: 'lasso', icon: 'lasso', label: 'whiteboard.tool.lasso', key: 'L' },
  { tool: 'pen', icon: 'pencil', label: 'whiteboard.tool.pen', key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: 'whiteboard.tool.highlighter', key: 'H' },
  { tool: 'eraser', icon: 'eraser', label: 'whiteboard.tool.eraser', key: 'E' },
  { tool: 'shape', icon: 'shapes', label: 'whiteboard.tool.shapes', key: 'S' },
  { tool: 'text', icon: 'text', label: 'whiteboard.tool.text', key: 'T' },
];

const SHAPES: { shape: ShapeKind; icon: IconName; label: MessageKey }[] = [
  { shape: 'rect', icon: 'rect', label: 'whiteboard.shape.rect' },
  { shape: 'ellipse', icon: 'ellipse', label: 'whiteboard.shape.ellipse' },
  { shape: 'line', icon: 'line', label: 'whiteboard.shape.line' },
  { shape: 'arrow', icon: 'arrow', label: 'whiteboard.shape.arrow' },
];

const FONTS: { font: FontKind; label: MessageKey }[] = [
  { font: 'sans', label: 'whiteboard.font.sans' },
  { font: 'serif', label: 'whiteboard.font.serif' },
  { font: 'hand', label: 'whiteboard.font.hand' },
];

const PAPER_LABEL: Record<PaperStyle, MessageKey> = {
  dots: 'whiteboard.paper.dots',
  grid: 'whiteboard.paper.grid',
  lines: 'whiteboard.paper.lines',
  blank: 'whiteboard.paper.blank',
};
const BG_LABEL: Record<PaperBackground, MessageKey> = {
  white: 'whiteboard.bg.white',
  cream: 'whiteboard.bg.cream',
  sky: 'whiteboard.bg.sky',
  mint: 'whiteboard.bg.mint',
  slate: 'whiteboard.bg.slate',
};

interface Props {
  tool: ToolState;
  onTool: (patch: Partial<ToolState>) => void;
  dock: Dock;
  onDock: (dock: Dock) => void;
  collapsed: boolean;
  onCollapsed: (c: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  paper: PaperStyle;
  background: PaperBackground;
  onPaper: (paper: PaperStyle) => void;
  onBackground: (bg: PaperBackground) => void;
  /** Element the toolbar docks inside (for drag-to-dock). */
  container: HTMLElement | null;
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-35 ${active ? 'bg-primary-soft text-accent-on-soft' : 'text-ink hover:bg-primary-soft'}`}
    >
      <Icon name={icon} filled={active ?? false} />
    </button>
  );
}

/** Size slider meaning depends on the tool: pen thickness, highlighter opacity, or text size. */
function sizeConfig(tool: ToolState) {
  if (tool.tool === 'highlighter')
    return {
      min: 10,
      max: 80,
      step: 5,
      value: tool.hlOpacity,
      unit: '%',
      key: 'hlOpacity' as const,
      label: 'whiteboard.opacity' as const,
    };
  if (tool.tool === 'text')
    return {
      min: 16,
      max: 96,
      step: 2,
      value: tool.textSize,
      unit: '',
      key: 'textSize' as const,
      label: 'whiteboard.textSize' as const,
    };
  return {
    min: 1,
    max: 24,
    step: 1,
    value: tool.penWidth,
    unit: 'px',
    key: 'penWidth' as const,
    label: 'whiteboard.size' as const,
  };
}

/**
 * Floating, draggable toolbar. Drag the grip to any edge to dock it left, right,
 * or bottom (remembered). Collapses to a small bar showing only the active tool.
 */
export function Toolbar(props: Props) {
  const { tool, onTool, dock, onDock, collapsed, onCollapsed, container } = props;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [panel, setPanel] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const vertical = dock !== 'bottom';
  const size = sizeConfig(tool);

  function onGripDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY });
  }
  function onGripMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (drag) setDrag({ x: e.clientX, y: e.clientY });
  }
  function onGripUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    setDrag(null);
    const rect = container?.getBoundingClientRect();
    if (!rect) return;
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    onDock(ry > 0.72 ? 'bottom' : rx < 0.5 ? 'left' : 'right');
  }

  const position = drag
    ? 'fixed z-40'
    : dock === 'left'
      ? 'absolute left-3 top-1/2 -translate-y-1/2'
      : dock === 'right'
        ? 'absolute right-3 top-1/2 -translate-y-1/2'
        : 'absolute bottom-3 left-1/2 -translate-x-1/2';
  const dragStyle = drag ? { left: drag.x - 22, top: drag.y - 22 } : undefined;
  const active = TOOLS.find((x) => x.tool === tool.tool) ?? TOOLS[1];
  const sep = vertical ? 'my-1 h-px w-8 bg-line' : 'mx-1 h-8 w-px bg-line';

  const grip = (
    <button
      type="button"
      aria-label={t('whiteboard.toolbar.move')}
      title={t('whiteboard.toolbar.moveHint')}
      onPointerDown={onGripDown}
      onPointerMove={onGripMove}
      onPointerUp={onGripUp}
      onKeyDown={(e) => {
        const map: Record<string, Dock> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'bottom' };
        const next = map[e.key];
        if (next) {
          e.preventDefault();
          onDock(next);
        }
      }}
      style={{ touchAction: 'none' }}
      className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-ink-muted hover:bg-primary-soft"
    >
      <Icon name="grip" />
    </button>
  );

  return (
    <>
      <div
        ref={rootRef}
        role="toolbar"
        aria-label={t('whiteboard.toolbar')}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        className={`${position} z-30 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-lg ${vertical ? 'flex-col overflow-y-auto' : 'flex-row overflow-x-auto'}`}
        style={dragStyle}
      >
        {grip}
        {collapsed ? (
          <>
            <ToolButton
              icon={active?.icon ?? 'pencil'}
              label={t(active?.label ?? 'whiteboard.tool.pen')}
              active
              onClick={() => onCollapsed(false)}
            />
            <ToolButton
              icon="expand"
              label={t('whiteboard.toolbar.expand')}
              onClick={() => onCollapsed(false)}
            />
          </>
        ) : (
          <>
            {TOOLS.map((x) => (
              <ToolButton
                key={x.tool}
                icon={x.icon}
                label={`${t(x.label)} (${x.key})`}
                active={tool.tool === x.tool}
                onClick={() => onTool({ tool: x.tool })}
              />
            ))}
            {tool.tool === 'shape' && (
              <div
                role="group"
                aria-label={t('whiteboard.tool.shapes')}
                className={`flex gap-0.5 rounded-lg bg-surface-sunken p-0.5 ${vertical ? 'flex-col' : ''}`}
              >
                {SHAPES.map((s) => (
                  <ToolButton
                    key={s.shape}
                    icon={s.icon}
                    label={t(s.label)}
                    active={tool.shape === s.shape}
                    onClick={() => onTool({ shape: s.shape })}
                  />
                ))}
              </div>
            )}
            {tool.tool === 'text' && (
              <div
                role="group"
                aria-label={t('whiteboard.font')}
                className={`flex gap-0.5 rounded-lg bg-surface-sunken p-0.5 ${vertical ? 'flex-col' : ''}`}
              >
                {FONTS.map((f) => (
                  <button
                    key={f.font}
                    type="button"
                    aria-label={t(f.label)}
                    title={t(f.label)}
                    aria-pressed={tool.font === f.font}
                    onClick={() => onTool({ font: f.font })}
                    style={{ fontFamily: FONT_FAMILY[f.font] }}
                    className={`inline-flex size-11 items-center justify-center rounded-lg text-lg ${tool.font === f.font ? 'bg-surface text-accent-on-soft shadow-sm' : 'text-ink'}`}
                  >
                    Aa
                  </button>
                ))}
              </div>
            )}
            <span aria-hidden="true" className={sep} />
            <div
              role="radiogroup"
              aria-label={t('whiteboard.color')}
              className={`flex gap-1 ${vertical ? 'flex-col' : ''}`}
            >
              {INK_COLORS.map((c) => {
                const checked = tool.color.toLowerCase() === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={t(c.label)}
                    title={t(c.label)}
                    onClick={() => onTool({ color: c.value })}
                    className="inline-flex size-11 items-center justify-center rounded-lg"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-7 rounded-full ${checked ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                      style={{ background: c.value }}
                    />
                  </button>
                );
              })}
            </div>
            <span aria-hidden="true" className={sep} />
            <label
              className={`flex items-center gap-1 text-xs text-ink-muted ${vertical ? 'flex-col py-1' : 'px-1'}`}
            >
              <span>{t(size.label)}</span>
              <input
                type="range"
                min={size.min}
                max={size.max}
                step={size.step}
                value={size.value}
                onChange={(e) => onTool({ [size.key]: Number(e.target.value) })}
                aria-valuetext={`${size.value}${size.unit}`}
                className={
                  vertical
                    ? 'h-28 w-6 accent-primary [direction:rtl] [writing-mode:vertical-lr]'
                    : 'h-6 w-28 accent-primary'
                }
              />
              <span aria-hidden="true" className="tabular-nums">
                {size.value}
                {size.unit}
              </span>
            </label>
            <span aria-hidden="true" className={sep} />
            <ToolButton
              icon="undo"
              label={t('whiteboard.undo')}
              disabled={!props.canUndo}
              onClick={props.onUndo}
            />
            <ToolButton
              icon="redo"
              label={t('whiteboard.redo')}
              disabled={!props.canRedo}
              onClick={props.onRedo}
            />
            <ToolButton
              icon="palette"
              label={t('whiteboard.palette')}
              active={panel}
              onClick={() => setPanel((v) => !v)}
            />
            <ToolButton
              icon="collapse"
              label={t('whiteboard.toolbar.collapse')}
              onClick={() => onCollapsed(true)}
            />
          </>
        )}
      </div>
      {panel && !collapsed && (
        <div
          role="dialog"
          aria-label={t('whiteboard.palette')}
          className={`absolute z-40 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-lg ${dock === 'left' ? 'top-3 left-24' : dock === 'right' ? 'top-3 right-24' : 'bottom-24 left-1/2 -translate-x-1/2'}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPanel(false);
          }}
        >
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-semibold text-ink">{t('whiteboard.paper')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAPER_STYLES.map((p) => (
                <label
                  key={p}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm ${props.paper === p ? 'border-primary bg-primary-soft font-semibold text-accent-on-soft' : 'border-line text-ink'}`}
                >
                  <input
                    type="radio"
                    name="paper"
                    value={p}
                    checked={props.paper === p}
                    onChange={() => props.onPaper(p)}
                    className="sr-only"
                  />
                  {t(PAPER_LABEL[p])}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('whiteboard.background')}</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAPER_BACKGROUNDS) as PaperBackground[]).map((bg) => (
                <label
                  key={bg}
                  title={t(BG_LABEL[bg])}
                  className="relative inline-flex size-11 cursor-pointer items-center justify-center"
                >
                  <input
                    type="radio"
                    name="background"
                    value={bg}
                    checked={props.background === bg}
                    onChange={() => props.onBackground(bg)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{t(BG_LABEL[bg])}</span>
                  <span
                    aria-hidden="true"
                    className="size-8 rounded-full border border-line-strong peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
                    style={{ background: PAPER_BACKGROUNDS[bg] }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => setPanel(false)}
            className="mt-4 min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-on-primary"
          >
            {t('common.done')}
          </button>
        </div>
      )}
    </>
  );
}
