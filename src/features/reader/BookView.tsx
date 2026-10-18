import { GlobalWorkerOptions, type PDFDocumentProxy, TextLayer, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Book, Highlight } from '../../data/books';
import { t } from '../../i18n/i18n';
import { Spinner } from '../../ui/Spinner';
import type { Quote } from './anchor';
import { type EpubBook, openEpub, renderChapter } from './epub/epub';
import { HIGHLIGHT_CLASS, applyHighlights, selectionIn } from './highlightDom';
import { splitText } from './txt';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Loaded =
  | { format: 'pdf'; pdf: PDFDocumentProxy; count: number; destroy: () => void }
  | { format: 'epub'; epub: EpubBook; count: number }
  | { format: 'txt'; sections: string[][]; count: number };

export interface SelectionEvent {
  quote: Quote;
  /** Rectangle relative to the book view's container. */
  rect: { x: number; top: number; bottom: number };
}

interface Props {
  book: Book;
  data: ArrayBuffer;
  section: number;
  highlights: Highlight[];
  onLoaded: (info: { count: number; title: string | null; author: string | null }) => void;
  onFailed: () => void;
  onSelection: (s: SelectionEvent | null) => void;
  onHighlightClick: (id: string, rect: SelectionEvent['rect']) => void;
  onScrollFraction: (f: number) => void;
  /** Gives the reader access to text for AI (current section, or the whole book up to a limit). */
  onTextApi?: (api: BookTextApi) => void;
}

export interface BookTextApi {
  sectionText: () => string;
  bookText: (limit: number) => Promise<string>;
}

export async function inspectBook(
  format: Book['format'],
  data: ArrayBuffer,
): Promise<Loaded & { title: string | null; author: string | null }> {
  if (format === 'pdf') {
    const task = getDocument({
      data: new Uint8Array(data.slice(0)),
      enableXfa: false,
      // Self-hosted data files (see vite.config.ts); never fetched from a CDN.
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
    });
    const pdf = await task.promise;
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: unknown; Author?: unknown };
    return {
      format,
      pdf,
      destroy: () => void task.destroy(),
      count: pdf.numPages,
      title: typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : null,
      author: typeof info.Author === 'string' && info.Author.trim() ? info.Author.trim() : null,
    };
  }
  if (format === 'epub') {
    const epub = await openEpub(new Uint8Array(data));
    return { format, epub, count: epub.chapters.length, title: epub.title, author: epub.author };
  }
  const sections = splitText(new TextDecoder().decode(data));
  return { format, sections, count: sections.length, title: null, author: null };
}

/** Text of the whole book, in order, up to `limit` characters (for "Summarize whole book"). */
async function wholeText(loaded: Loaded, limit: number): Promise<string> {
  const parts: string[] = [];
  let size = 0;
  const add = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    parts.push(clean);
    size += clean.length + 2;
  };
  if (loaded.format === 'txt')
    for (const section of loaded.sections) for (const p of section) if (size < limit) add(p);
  if (loaded.format === 'pdf')
    for (let i = 1; i <= loaded.pdf.numPages && size < limit; i++) {
      const content = await (await loaded.pdf.getPage(i)).getTextContent();
      add(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
  if (loaded.format === 'epub')
    for (const chapter of loaded.epub.chapters) {
      if (size >= limit) break;
      const html = await loaded.epub.zip.text(chapter.path);
      add(new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '');
    }
  return parts.join('\n\n').slice(0, limit);
}

/** Reading stylesheet for EPUB chapters (theme colours passed in as values). */
function epubDocument(
  html: string,
  colors: { ink: string; surface: string; accent: string; highlight: string },
) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'; font-src 'none'">
<style>
html{color-scheme:light dark}
body{margin:0;padding:24px 28px 48px;background:${colors.surface};color:${colors.ink};font:18px/1.7 "Noto Serif",Georgia,serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
a{color:${colors.accent}}
mark.${HIGHLIGHT_CLASS}{background:${colors.highlight};color:inherit;border-radius:2px;cursor:pointer}
</style></head><body>${html}</body></html>`;
}

/**
 * Renders one section of a book: a PDF page (canvas + selectable text layer),
 * an EPUB chapter (sanitised, in a sandboxed iframe without scripts), or a
 * part of a TXT file. Reports selections and draws highlights.
 */
export function BookView(props: Props) {
  const {
    book,
    data,
    section,
    highlights,
    onLoaded,
    onFailed,
    onSelection,
    onHighlightClick,
    onScrollFraction,
    onTextApi,
  } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(0);
  const textRoot = useRef<HTMLElement | null>(null);
  const highlightsRef = useRef(highlights);
  const callbacks = useRef({
    onLoaded,
    onFailed,
    onSelection,
    onHighlightClick,
    onScrollFraction,
    onTextApi,
  });
  useLayoutEffect(() => {
    callbacks.current = { onLoaded, onFailed, onSelection, onHighlightClick, onScrollFraction, onTextApi };
  });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.round(e.contentRect.width)));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    inspectBook(book.format, data)
      .then((result) => {
        if (cancelled) {
          if (result.format === 'pdf') result.destroy();
          return;
        }
        if (result.format === 'pdf') destroy = result.destroy;
        setLoaded(result);
        callbacks.current.onLoaded({ count: result.count, title: result.title, author: result.author });
        callbacks.current.onTextApi?.({
          sectionText: () => (textRoot.current?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          bookText: (limit) => wholeText(result, limit),
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onFailed();
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [book.format, data]);

  const relRect = useCallback((r: DOMRect, offset = { left: 0, top: 0 }) => {
    const box = boxRef.current?.getBoundingClientRect();
    const left = r.left + offset.left - (box?.left ?? 0);
    const top = r.top + offset.top - (box?.top ?? 0);
    return { x: left + r.width / 2, top, bottom: top + r.height };
  }, []);

  // Render the current section.
  useEffect(() => {
    const host = pageRef.current;
    if (!loaded || !host || width === 0) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    setRendering(true);
    host.replaceChildren();
    textRoot.current = null;
    callbacks.current.onSelection(null);

    const watchSelection = (
      doc: Document,
      root: HTMLElement,
      offset: () => { left: number; top: number },
    ) => {
      const report = () => {
        const sel = selectionIn(root);
        callbacks.current.onSelection(sel ? { quote: sel.quote, rect: relRect(sel.rect, offset()) } : null);
      };
      const onUp = () => window.setTimeout(report, 0);
      const onClick = (e: Event) => {
        const mark = (e.target as globalThis.Element | null)?.closest?.(
          `mark.${HIGHLIGHT_CLASS}`,
        ) as HTMLElement | null;
        const id = mark?.dataset.highlight;
        if (mark && id && doc.getSelection()?.isCollapsed)
          callbacks.current.onHighlightClick(id, relRect(mark.getBoundingClientRect(), offset()));
      };
      doc.addEventListener('pointerup', onUp);
      doc.addEventListener('keyup', onUp);
      doc.addEventListener('click', onClick);
      cleanups.push(() => {
        doc.removeEventListener('pointerup', onUp);
        doc.removeEventListener('keyup', onUp);
        doc.removeEventListener('click', onClick);
      });
    };

    (async () => {
      if (loaded.format === 'pdf') {
        const page = await loaded.pdf.getPage(section + 1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = Math.min(width - 32, 900);
        const viewport = page.getViewport({ scale: cssWidth / base.width });
        const dpr = window.devicePixelRatio || 1;
        const wrap = document.createElement('div');
        wrap.className = 'relative mx-auto bg-white shadow-sm';
        wrap.style.width = `${viewport.width}px`;
        wrap.style.height = `${viewport.height}px`;
        wrap.style.setProperty('--scale-factor', String(viewport.scale));
        wrap.style.setProperty('--total-scale-factor', String(viewport.scale));
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('aria-hidden', 'true');
        const text = document.createElement('div');
        text.className = 'textLayer';
        wrap.append(canvas, text);
        host.append(wrap);
        await page.render({ canvas, viewport: page.getViewport({ scale: viewport.scale * dpr }) }).promise;
        if (cancelled) return;
        await new TextLayer({
          textContentSource: page.streamTextContent(),
          container: text,
          viewport,
        }).render();
        if (cancelled) return;
        textRoot.current = text;
        watchSelection(document, text, () => ({ left: 0, top: 0 }));
      } else if (loaded.format === 'txt') {
        const article = document.createElement('article');
        article.className =
          'mx-auto max-w-3xl rounded-2xl border border-line bg-surface px-6 py-8 font-serif text-lg leading-relaxed text-ink sm:px-10';
        for (const p of loaded.sections[section] ?? []) {
          const el = document.createElement('p');
          el.className = 'mb-4 whitespace-pre-wrap';
          el.textContent = p;
          article.append(el);
        }
        host.append(article);
        textRoot.current = article;
        watchSelection(document, article, () => ({ left: 0, top: 0 }));
      } else {
        const chapter = await renderChapter(loaded.epub, section);
        if (cancelled) {
          chapter.urls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        cleanups.push(() => chapter.urls.forEach((u) => URL.revokeObjectURL(u)));
        const css = getComputedStyle(document.documentElement);
        const iframe = document.createElement('iframe');
        // No allow-scripts: book content can never run code. Same-origin only so the
        // app can read the selection and draw highlights.
        iframe.setAttribute('sandbox', 'allow-same-origin');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.title = t('reader.chapterFrame', { n: section + 1 });
        iframe.className = 'mx-auto block h-full w-full max-w-3xl rounded-2xl border border-line bg-surface';
        iframe.srcdoc = epubDocument(chapter.html, {
          ink: css.getPropertyValue('--ink').trim(),
          surface: css.getPropertyValue('--surface').trim(),
          accent: css.getPropertyValue('--accent').trim(),
          highlight: css.getPropertyValue('--highlight').trim(),
        });
        host.append(iframe);
        await new Promise<void>((resolve) =>
          iframe.addEventListener('load', () => resolve(), { once: true }),
        );
        if (cancelled || !iframe.contentDocument?.body) return;
        const doc = iframe.contentDocument;
        textRoot.current = doc.body;
        const offset = () => {
          const r = iframe.getBoundingClientRect();
          return { left: r.left, top: r.top };
        };
        watchSelection(doc, doc.body, offset);
        const onScroll = () => {
          const el = doc.scrollingElement;
          if (el)
            callbacks.current.onScrollFraction(
              el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1,
            );
        };
        doc.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => doc.removeEventListener('scroll', onScroll));
      }
      if (!cancelled) {
        setRendering(false);
        if (textRoot.current) applyHighlights(textRoot.current, highlightsRef.current);
      }
    })().catch(() => {
      if (!cancelled) callbacks.current.onFailed();
    });

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
    };
  }, [loaded, section, width, relRect]);

  // Redraw highlights when they change (without re-rendering the section).
  useEffect(() => {
    highlightsRef.current = highlights;
    if (textRoot.current && !rendering) applyHighlights(textRoot.current, highlights);
  }, [highlights, rendering]);

  return (
    <div
      ref={boxRef}
      className={`relative h-full ${book.format === 'epub' ? 'overflow-hidden p-4' : 'overflow-y-auto px-4 py-6'}`}
      onScroll={(e) => {
        const el = e.currentTarget;
        onScrollFraction(
          el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1,
        );
      }}
    >
      <div ref={pageRef} className={book.format === 'epub' ? 'h-full' : ''} />
      {(rendering || !loaded) && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-canvas/60 text-ink-muted"
        >
          <Spinner /> {t('reader.rendering')}
        </div>
      )}
    </div>
  );
}
