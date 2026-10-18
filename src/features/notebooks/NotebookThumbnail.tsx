import { useEffect, useMemo, useRef, useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import type { SubjectColor } from '../../data/models';
import { type Notebook, subscribeFirstPage } from '../../data/notebooks';
import { useLive } from '../../data/useLive';
import { Icon } from '../../ui/Icon';
import { SUBJECT_CLASSES } from '../subjects/subjectColors';
import { type Element, PAGE_WIDTH, unionBounds } from '../whiteboard/model';
import { drawElements, drawPaper, ensureFonts, fitView } from '../whiteboard/render';

function useVisible(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisible(true);
    });
    io.observe(node);
    return () => io.disconnect();
  }, [ref, visible]);
  return visible;
}

/**
 * Live preview of the first page. Empty notebooks show a subject-coloured
 * placeholder with a simple icon. The page only loads once the card scrolls into view.
 */
export function NotebookThumbnail({ notebook, color }: { notebook: Notebook; color: SubjectColor | null }) {
  const { uid } = useSignedInUser();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(boxRef);
  const page = useLive<Element[]>(visible ? `${notebook.id}` : null, (next, fail) =>
    subscribeFirstPage(uid, notebook.id, next, fail),
  );
  const elements = useMemo(() => (page.status === 'ready' ? page.data : []), [page]);
  const empty = page.status === 'ready' && elements.length === 0;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fontsReady, setFontsReady] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureFonts(elements).then((loaded) => {
      if (loaded && !cancelled) setFontsReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [elements]);

  // Redraw when the card is laid out or resized (a 0-width first measure draws nothing).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || page.status !== 'ready' || elements.length === 0 || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = size;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (notebook.mode === 'paged') {
      // Top of the page at full card width, like a page peeking out of a notebook.
      const scale = canvas.width / PAGE_WIDTH;
      const view = { scale, offsetX: 0, offsetY: 0 };
      const rect = { x: 0, y: 0, width: PAGE_WIDTH, height: canvas.height / scale };
      drawPaper(ctx, notebook.paper, notebook.background, rect, view);
      drawElements(ctx, elements, view);
    } else {
      const b = unionBounds(elements);
      if (!b) return;
      const pad = 40;
      const rect = {
        x: b.minX - pad,
        y: b.minY - pad,
        width: b.maxX - b.minX + pad * 2,
        height: b.maxY - b.minY + pad * 2,
      };
      const view = fitView(rect, canvas.width, canvas.height);
      drawPaper(
        ctx,
        notebook.paper,
        notebook.background,
        { x: -1e5, y: -1e5, width: 2e5, height: 2e5 },
        view,
      );
      drawElements(ctx, elements, view);
    }
  }, [elements, notebook.mode, notebook.paper, notebook.background, page.status, size, fontsReady]);

  const soft = color ? SUBJECT_CLASSES[color].soft : 'bg-surface-sunken';
  const text = color ? SUBJECT_CLASSES[color].text : 'text-ink-muted';

  return (
    <div
      ref={boxRef}
      className={`relative h-36 overflow-hidden ${empty || page.status !== 'ready' ? soft : ''}`}
    >
      {page.status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-surface-sunken motion-reduce:animate-none"
        />
      )}
      {(empty || page.status === 'error') && (
        <div aria-hidden="true" className={`flex h-full items-center justify-center ${text}`}>
          <Icon name="file" size={64} />
        </div>
      )}
      <canvas ref={canvasRef} aria-hidden="true" className={`size-full ${empty ? 'hidden' : ''}`} />
    </div>
  );
}
