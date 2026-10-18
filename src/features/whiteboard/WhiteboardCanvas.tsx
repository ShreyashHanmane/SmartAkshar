import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { t } from '../../i18n/i18n';
import { moveSelected, pathLength, removeSelected, selectInLoop, textAt } from './geometry';
import {
  type Bounds,
  type Element,
  type FontKind,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Point,
  type ShapeKind,
  type TextElement,
  simplify,
  unionBounds,
} from './model';
import type { PaperBackground, PaperStyle } from './paper';
import { FONT_FAMILY, type View, drawElement, drawElements, drawPaper, ensureFonts } from './render';
import { SelectionMenu } from './SelectionMenu';
import { type Area, type ViewState, bitmapTransform, computeView, toLogical, zoomAt } from './viewport';

export type ToolName = 'lasso' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text';

export interface ToolState {
  tool: ToolName;
  color: string;
  penWidth: number;
  /** Highlighter opacity in percent. */
  hlOpacity: number;
  textSize: number;
  font: FontKind;
  shape: ShapeKind;
}

export const HIGHLIGHTER_WIDTH = 24;

interface Props {
  elements: Element[];
  mode: 'paged' | 'infinite';
  paper: PaperStyle;
  background: PaperBackground;
  tool: ToolState;
  view: ViewState;
  onViewChange: (v: ViewState) => void;
  insets: { left: number; right: number; top: number; bottom: number };
  /** Applies a new element list for this page; returns 'too-large' if the page is full. */
  onChange: (elements: Element[]) => 'ok' | 'too-large';
  onPageFull: () => void;
  label: string;
}

type Gesture =
  | { kind: 'draw'; id: number; points: Point[] }
  | { kind: 'loop'; id: number; points: Point[]; erase: boolean }
  | { kind: 'shape'; id: number; start: Point; end: Point }
  | { kind: 'move'; id: number; start: Point; dx: number; dy: number }
  | { kind: 'text'; id: number; at: Point }
  | { kind: 'pan'; id: number; startX: number; startY: number; from: ViewState }
  | { kind: 'pinch'; startDist: number; startMid: { x: number; y: number }; from: ViewState };

interface TextDraft {
  id: string;
  x: number;
  y: number;
  boxWidth: number;
  text: string;
  /** The element being edited (hidden from the canvas while editing). */
  existing?: TextElement;
}

const newId = () => crypto.randomUUID();

function pressureOf(e: PointerEvent): number {
  if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.5;
  return 0.6;
}

/**
 * The drawing surface. Two stacked canvases: a cached base layer (paper and
 * committed elements; redrawn only when they change, and only the new element
 * after a stroke) and a live layer for the gesture in progress. During pan and
 * zoom the base bitmap is moved with a CSS transform and redrawn once at rest.
 */
export function WhiteboardCanvas(props: Props) {
  const { elements, mode, paper, background, tool, view, onViewChange, insets, onChange, onPageFull, label } =
    props;
  const boxRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [moveOffset, setMoveOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const stylusMode = useRef(false);
  const spaceHeld = useRef(false);
  const rendered = useRef<{ view: View; key: string; elements: Element[] } | null>(null);
  const settle = useRef<number | null>(null);

  // --- layout -------------------------------------------------------------
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const area: Area = useMemo(
    () => ({
      left: insets.left,
      top: insets.top,
      width: Math.max(1, size.width - insets.left - insets.right),
      height: Math.max(1, size.height - insets.top - insets.bottom),
    }),
    [size, insets],
  );
  const current = useMemo(() => computeView(mode, area, view), [mode, area, view]);
  const viewRef = useRef(current);
  useLayoutEffect(() => {
    viewRef.current = current;
  }, [current]);

  // Drop selection entries that no longer exist (e.g. after undo).
  const liveSelection = useMemo(() => {
    const ids = new Set(elements.map((e) => e.id));
    return new Set([...selection].filter((id) => ids.has(id)));
  }, [elements, selection]);

  const hidden = useMemo(() => {
    const ids = new Set<string>();
    if (moveOffset) for (const id of liveSelection) ids.add(id);
    if (draft?.existing) ids.add(draft.existing.id);
    return ids;
  }, [moveOffset, liveSelection, draft]);

  // --- base layer ---------------------------------------------------------
  const renderBase = useCallback(
    (v: View) => {
      const canvas = baseRef.current;
      if (!canvas || size.width === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const key = `${mode}|${paper}|${background}|${size.width}x${size.height}|${[...hidden].join(',')}`;
      const pixelView: View = { scale: v.scale * dpr, offsetX: v.offsetX * dpr, offsetY: v.offsetY * dpr };
      const prev = rendered.current;
      const sameView =
        prev &&
        prev.view.scale === v.scale &&
        prev.view.offsetX === v.offsetX &&
        prev.view.offsetY === v.offsetY;
      // Fast path: only new elements were appended (the usual case after a stroke).
      if (
        prev &&
        sameView &&
        prev.key === key &&
        elements.length > prev.elements.length &&
        prev.elements.every((el, i) => elements[i] === el)
      ) {
        ctx.save();
        ctx.setTransform(pixelView.scale, 0, 0, pixelView.scale, pixelView.offsetX, pixelView.offsetY);
        if (mode === 'paged') {
          ctx.beginPath();
          ctx.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          ctx.clip();
        }
        for (const el of elements.slice(prev.elements.length)) if (!hidden.has(el.id)) drawElement(ctx, el);
        ctx.restore();
        rendered.current = { view: v, key, elements };
        return;
      }
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const rect =
        mode === 'paged'
          ? { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }
          : (() => {
              const tl = toLogical(v, 0, 0);
              const br = toLogical(v, size.width, size.height);
              return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
            })();
      drawPaper(ctx, paper, background, rect, pixelView);
      ctx.save();
      if (mode === 'paged') {
        ctx.setTransform(pixelView.scale, 0, 0, pixelView.scale, pixelView.offsetX, pixelView.offsetY);
        ctx.beginPath();
        ctx.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      drawElements(ctx, hidden.size ? elements.filter((el) => !hidden.has(el.id)) : elements, pixelView);
      ctx.restore();
      canvas.style.transform = '';
      rendered.current = { view: v, key, elements };
    },
    [elements, mode, paper, background, size, hidden],
  );

  // Text in serif/handwriting fonts: redraw once the font files have loaded.
  useEffect(() => {
    let cancelled = false;
    void ensureFonts(elements).then((loaded) => {
      if (loaded && !cancelled) {
        rendered.current = null;
        renderBase(viewRef.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [elements, renderBase]);

  // Redraw when content changes; during view changes move the bitmap and redraw once settled.
  useEffect(() => {
    const prev = rendered.current;
    const canvas = baseRef.current;
    const viewChanged =
      prev &&
      (prev.view.scale !== current.scale ||
        prev.view.offsetX !== current.offsetX ||
        prev.view.offsetY !== current.offsetY);
    if (prev && viewChanged && canvas && prev.elements === elements) {
      canvas.style.transformOrigin = '0 0';
      canvas.style.transform = bitmapTransform(prev.view, current);
      if (settle.current !== null) window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        settle.current = null;
        if (!gesture.current || (gesture.current.kind !== 'pinch' && gesture.current.kind !== 'pan'))
          renderBase(viewRef.current);
      }, 140);
      return;
    }
    renderBase(current);
  }, [current, elements, renderBase]);

  // --- live layer ---------------------------------------------------------
  const drawLive = useCallback(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.width * dpr)) canvas.width = Math.round(size.width * dpr);
    if (canvas.height !== Math.round(size.height * dpr)) canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const v = viewRef.current;
    const pv: View = { scale: v.scale * dpr, offsetX: v.offsetX * dpr, offsetY: v.offsetY * dpr };
    const g = gesture.current;
    ctx.save();
    ctx.setTransform(pv.scale, 0, 0, pv.scale, pv.offsetX, pv.offsetY);
    if (g?.kind === 'draw') {
      drawElement(ctx, {
        kind: 'stroke',
        id: 'live',
        tool: tool.tool === 'highlighter' ? 'highlighter' : 'pen',
        color: tool.color,
        width: tool.tool === 'highlighter' ? HIGHLIGHTER_WIDTH : tool.penWidth,
        opacity: tool.hlOpacity / 100,
        points: g.points,
      });
    } else if (g?.kind === 'loop') {
      ctx.setLineDash([8 / v.scale, 6 / v.scale]);
      ctx.lineWidth = 2 / v.scale;
      ctx.strokeStyle = g.erase ? '#c22a2a' : '#1270c4';
      ctx.beginPath();
      g.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    } else if (g?.kind === 'shape') {
      drawElement(ctx, {
        kind: 'shape',
        id: 'live',
        shape: tool.shape,
        color: tool.color,
        width: tool.penWidth,
        x1: g.start.x,
        y1: g.start.y,
        x2: g.end.x,
        y2: g.end.y,
      });
    }
    // Selection: moved preview plus a dashed box.
    if (liveSelection.size) {
      const selected = elements.filter((el) => liveSelection.has(el.id));
      const offset = moveOffset ?? { dx: 0, dy: 0 };
      if (moveOffset)
        for (const el of moveSelected(selected, liveSelection, offset.dx, offset.dy)) drawElement(ctx, el);
      const b = unionBounds(selected);
      if (b) {
        ctx.setLineDash([6 / v.scale, 4 / v.scale]);
        ctx.lineWidth = 1.5 / v.scale;
        ctx.strokeStyle = '#1270c4';
        ctx.strokeRect(
          b.minX + offset.dx - 8,
          b.minY + offset.dy - 8,
          b.maxX - b.minX + 16,
          b.maxY - b.minY + 16,
        );
      }
    }
    ctx.restore();
  }, [size, tool, elements, liveSelection, moveOffset]);

  useEffect(() => {
    drawLive();
  }, [drawLive, current]);

  // --- commits ------------------------------------------------------------
  const commit = useCallback(
    (next: Element[]) => {
      if (onChange(next) === 'too-large') onPageFull();
    },
    [onChange, onPageFull],
  );

  const selectionBounds: Bounds | null = useMemo(
    () => unionBounds(elements.filter((el) => liveSelection.has(el.id))),
    [elements, liveSelection],
  );

  const finishDraft = useCallback(
    (d: TextDraft | null) => {
      if (!d) return;
      setDraft(null);
      const text = d.text.replace(/\s+$/, '');
      const without = d.existing ? elements.filter((el) => el.id !== d.existing?.id) : elements;
      if (!text) {
        if (d.existing) commit(without);
        return;
      }
      const el: TextElement = {
        kind: 'text',
        id: d.existing?.id ?? d.id,
        color: d.existing?.color ?? tool.color,
        font: d.existing?.font ?? tool.font,
        size: d.existing?.size ?? tool.textSize,
        x: d.x,
        y: d.y,
        boxWidth: d.boxWidth,
        text: text.slice(0, 5000),
      };
      if (d.existing && d.existing.text === el.text) return;
      commit(d.existing ? elements.map((x) => (x.id === el.id ? el : x)) : [...elements, el]);
    },
    [elements, commit, tool.color, tool.font, tool.textSize],
  );

  const openText = useCallback(
    (at: Point) => {
      const existing = textAt(elements, at);
      if (existing) {
        setDraft({
          id: existing.id,
          x: existing.x,
          y: existing.y,
          boxWidth: existing.boxWidth,
          text: existing.text,
          existing,
        });
        return;
      }
      const boxWidth = mode === 'paged' ? Math.max(120, Math.min(480, PAGE_WIDTH - at.x - 24)) : 480;
      setDraft({ id: newId(), x: at.x, y: at.y, boxWidth, text: '' });
    },
    [elements, mode],
  );

  // --- pointer handling ---------------------------------------------------
  const local = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  const logical = (e: PointerEvent): Point => {
    const s = local(e);
    const l = toLogical(viewRef.current, s.x, s.y);
    return { x: l.x, y: l.y, p: pressureOf(e) };
  };

  function startPinch() {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return;
    gesture.current = {
      kind: 'pinch',
      startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      from: view,
    };
    drawLive();
  }

  function onPointerDown(ev: ReactPointerEvent<HTMLCanvasElement>) {
    const e = ev.nativeEvent;
    if (draft) {
      finishDraft(draft);
      return;
    }
    if (e.pointerType === 'pen') stylusMode.current = true;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, local(e));
      if (touches.current.size === 2) {
        // A second finger cancels any stroke in progress and starts pinch/pan.
        startPinch();
        return;
      }
      // Palm rejection: once a stylus is in use, single touches never draw.
      if (stylusMode.current || touches.current.size > 2) return;
    }
    try {
      ev.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch); drawing still works without capture.
    }
    if (e.button === 1 || (e.pointerType === 'mouse' && spaceHeld.current)) {
      gesture.current = { kind: 'pan', id: e.pointerId, startX: e.clientX, startY: e.clientY, from: view };
      return;
    }
    if (e.button !== 0) return;
    const p = logical(e);
    // Pen eraser end / barrel button erases.
    const erasing = tool.tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32) !== 0);
    if (erasing) gesture.current = { kind: 'loop', id: e.pointerId, points: [p], erase: true };
    else if (tool.tool === 'pen' || tool.tool === 'highlighter') {
      setSelection(new Set());
      gesture.current = { kind: 'draw', id: e.pointerId, points: [p] };
    } else if (tool.tool === 'lasso') {
      const b = selectionBounds;
      if (b && p.x >= b.minX - 8 && p.x <= b.maxX + 8 && p.y >= b.minY - 8 && p.y <= b.maxY + 8) {
        gesture.current = { kind: 'move', id: e.pointerId, start: p, dx: 0, dy: 0 };
        setMoveOffset({ dx: 0, dy: 0 });
      } else gesture.current = { kind: 'loop', id: e.pointerId, points: [p], erase: false };
    } else if (tool.tool === 'shape') gesture.current = { kind: 'shape', id: e.pointerId, start: p, end: p };
    else gesture.current = { kind: 'text', id: e.pointerId, at: p };
    drawLive();
  }

  function onPointerMove(ev: ReactPointerEvent<HTMLCanvasElement>) {
    const e = ev.nativeEvent;
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId))
      touches.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const [a, b] = [...touches.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(mode, area, g.from, dist / g.startDist, g.startMid.x, g.startMid.y);
      onViewChange({
        ...zoomed,
        panX: zoomed.panX + mid.x - g.startMid.x,
        panY: zoomed.panY + mid.y - g.startMid.y,
      });
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.kind === 'pan') {
      onViewChange({
        ...g.from,
        panX: g.from.panX + e.clientX - g.startX,
        panY: g.from.panY + e.clientY - g.startY,
      });
      return;
    }
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    const pts = (events.length ? events : [e]).map(logical);
    const last = pts[pts.length - 1] as Point;
    if (g.kind === 'draw' || g.kind === 'loop') g.points.push(...pts);
    else if (g.kind === 'shape') g.end = last;
    else if (g.kind === 'move') {
      g.dx = last.x - g.start.x;
      g.dy = last.y - g.start.y;
      setMoveOffset({ dx: g.dx, dy: g.dy });
    }
    drawLive();
  }

  function onPointerUp(ev: ReactPointerEvent<HTMLCanvasElement>) {
    const e = ev.nativeEvent;
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches.current.size < 2) {
        gesture.current = null;
        renderBase(viewRef.current);
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    gesture.current = null;
    const cancelled = e.type === 'pointercancel';
    if (g.kind === 'pan') renderBase(viewRef.current);
    else if (cancelled) {
      // Stroke interrupted (e.g. the OS took the touch): keep nothing half-drawn.
      setMoveOffset(null);
    } else if (g.kind === 'draw') {
      const hl = tool.tool === 'highlighter';
      commit([
        ...elements,
        {
          kind: 'stroke',
          id: newId(),
          tool: hl ? 'highlighter' : 'pen',
          color: tool.color,
          width: hl ? HIGHLIGHTER_WIDTH : tool.penWidth,
          opacity: hl ? tool.hlOpacity / 100 : 1,
          points: simplify(g.points, 0.35 / Math.max(viewRef.current.scale, 0.1)),
        },
      ]);
    } else if (g.kind === 'loop') {
      if (pathLength(g.points) > 24 / viewRef.current.scale) {
        const ids = selectInLoop(elements, g.points);
        if (g.erase) {
          if (ids.size) commit(removeSelected(elements, ids));
        } else setSelection(ids);
      } else if (!g.erase) setSelection(new Set());
    } else if (g.kind === 'shape') {
      if (Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) > 4) {
        commit([
          ...elements,
          {
            kind: 'shape',
            id: newId(),
            shape: tool.shape,
            color: tool.color,
            width: tool.penWidth,
            x1: Math.round(g.start.x),
            y1: Math.round(g.start.y),
            x2: Math.round(g.end.x),
            y2: Math.round(g.end.y),
          },
        ]);
      }
    } else if (g.kind === 'move') {
      setMoveOffset(null);
      if (Math.abs(g.dx) + Math.abs(g.dy) > 0.5) commit(moveSelected(elements, liveSelection, g.dx, g.dy));
    } else if (g.kind === 'text') openText(g.at);
    drawLive();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const s = local(e);
    if (e.ctrlKey || e.metaKey) onViewChange(zoomAt(mode, area, view, Math.exp(-e.deltaY * 0.01), s.x, s.y));
    else onViewChange({ ...view, panX: view.panX - e.deltaX, panY: view.panY - e.deltaY });
  }
  const wheelRef = useRef(onWheel);
  useLayoutEffect(() => {
    wheelRef.current = onWheel;
  });
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => wheelRef.current(e);
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  // --- keyboard -----------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.key === ' ' &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLInputElement)
      )
        spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (liveSelection.size) {
      const step = e.shiftKey ? 50 : 10;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (e.key === 'Delete' || e.key === 'Backspace') {
        commit(removeSelected(elements, liveSelection));
        setSelection(new Set());
      } else if (e.key === 'Escape') setSelection(new Set());
      else if (moves[e.key]) {
        const [dx, dy] = moves[e.key] as [number, number];
        commit(moveSelected(elements, liveSelection, dx, dy));
      } else return;
      e.preventDefault();
      return;
    }
    // Keyboard text entry: Enter with the text tool adds a text box at the top-left of the view.
    if (e.key === 'Enter' && tool.tool === 'text') {
      const at = toLogical(viewRef.current, area.left + 40, area.top + 40);
      openText({ x: Math.max(16, at.x), y: Math.max(16, at.y), p: 1 });
      e.preventDefault();
    }
  }

  // --- render -------------------------------------------------------------
  const draftStyle = draft
    ? {
        left: draft.x * current.scale + current.offsetX,
        top: draft.y * current.scale + current.offsetY,
        width: draft.boxWidth * current.scale,
        fontSize: (draft.existing?.size ?? tool.textSize) * current.scale,
        lineHeight: 1.3,
        fontFamily: FONT_FAMILY[draft.existing?.font ?? tool.font],
        color: draft.existing?.color ?? tool.color,
      }
    : undefined;

  const menuAnchor =
    selectionBounds && !moveOffset
      ? {
          x: ((selectionBounds.minX + selectionBounds.maxX) / 2) * current.scale + current.offsetX,
          top: (selectionBounds.minY - 8) * current.scale + current.offsetY,
          bottom: (selectionBounds.maxY + 8) * current.scale + current.offsetY,
        }
      : null;

  const cursor = {
    pen: 'crosshair',
    highlighter: 'crosshair',
    eraser: 'cell',
    lasso: 'default',
    shape: 'crosshair',
    text: 'text',
  }[tool.tool];

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden bg-surface-sunken">
      <canvas ref={baseRef} aria-hidden="true" className="absolute top-0 left-0 size-full" />
      <canvas
        ref={liveRef}
        role="img"
        aria-label={label}
        tabIndex={0}
        style={{ cursor, touchAction: 'none' }}
        className="absolute top-0 left-0 size-full focus-visible:outline-offset-[-4px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      />
      {draft && draftStyle && (
        <textarea
          autoFocus
          aria-label={t('whiteboard.textBox')}
          value={draft.text}
          maxLength={5000}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onBlur={() => finishDraft(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              finishDraft(draft);
            }
          }}
          style={draftStyle}
          className="absolute z-10 min-h-[1.5em] resize-none overflow-hidden rounded border border-dashed border-primary bg-transparent p-0 outline-none"
          rows={Math.max(1, draft.text.split('\n').length)}
        />
      )}
      {menuAnchor && liveSelection.size > 0 && (
        <SelectionMenu
          anchor={menuAnchor}
          bounds={{ width: size.width, height: size.height }}
          count={liveSelection.size}
          onMove={() => liveRef.current?.focus()}
          onErase={() => {
            commit(removeSelected(elements, liveSelection));
            setSelection(new Set());
          }}
          onDone={() => setSelection(new Set())}
        />
      )}
    </div>
  );
}
