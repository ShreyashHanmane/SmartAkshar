import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { useStudyTracker } from '../../app/study/useStudyTracker';
import { LOCAL_KEY_PREFIX } from '../../data/auth';
import {
  type Book,
  type Highlight,
  addHighlight,
  downloadBook,
  markOpened,
  removeHighlight,
  saveProgress,
  subscribeBook,
  subscribeHighlights,
  updateBookMeta,
} from '../../data/books';
import { type Notebook, createNotebook, subscribeNotebook } from '../../data/notebooks';
import { useLive } from '../../data/useLive';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { IconButton } from '../../ui/Button';
import { FullPageLoader } from '../../ui/FullPageLoader';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { useToast } from '../../ui/Toast';
import { CreateFlashcardDialog } from '../flashcards/dialogs';
import { SubjectsProvider } from '../subjects/SubjectsProvider';
import { Editor } from '../whiteboard/WhiteboardPage';
import { BookView, type SelectionEvent } from './BookView';
import { SelectionPopover } from './SelectionPopover';

const SPLIT_KEY = `${LOCAL_KEY_PREFIX}reader:split`;
const FORMAT_LABEL = { pdf: 'PDF', epub: 'EPUB', txt: 'TXT' } as const;

function readSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v >= 0.3 && v <= 0.7 ? v : 0.5;
  } catch {
    return 0.5;
  }
}

/** The notes pane: the book's linked notebook (created on first use). */
function NotesPane({ book }: { book: Book }) {
  const { uid } = useSignedInUser();
  const creating = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (book.notebookId || creating.current) return;
    creating.current = true;
    const { id, done } = createNotebook(uid, {
      title: t('reader.notesFor', { title: book.title }).slice(0, 120),
      subjectId: null,
    });
    updateBookMeta(uid, book.id, { notebookId: id }).catch(() => setFailed(true));
    done.catch(() => setFailed(true));
  }, [book.notebookId, book.id, book.title, uid]);

  const id = book.notebookId;
  const live = useLive<Notebook | null>(id, (next, fail) =>
    id ? subscribeNotebook(uid, id, next, fail) : () => undefined,
  );
  if (failed || live.status === 'error') return <Alert tone="error">{t('reader.notesFailed')}</Alert>;
  if (!id || live.status === 'loading') return <FullPageLoader />;
  if (!live.data) return <Alert tone="error">{t('reader.notesFailed')}</Alert>;
  return <Editor key={live.data.id} notebook={live.data} tab="whiteboard" onTab={() => undefined} embedded />;
}

function Reader({ book }: { book: Book }) {
  const { uid } = useSignedInUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const withNotes = params.get('notes') === '1';
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [state, setState] = useState<'downloading' | 'ready' | 'download-failed' | 'open-failed'>(
    'downloading',
  );
  const [count, setCount] = useState(Math.max(1, book.pageCount));
  const [section, setSection] = useState(() =>
    book.format === 'pdf' ? Math.max(0, (book.position.page ?? 1) - 1) : (book.position.chapter ?? 0),
  );
  const [fraction, setFraction] = useState(book.position.fraction ?? 0);
  const [selection, setSelection] = useState<SelectionEvent | null>(null);
  const [clicked, setClicked] = useState<{ id: string; rect: SelectionEvent['rect'] } | null>(null);
  const [cardText, setCardText] = useState<string | null>(null);
  const [split, setSplit] = useState(readSplit);
  const [mobileTab, setMobileTab] = useState<'book' | 'notes'>('book');
  const paneRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  useStudyTracker();

  const highlights = useLive<Highlight[]>(book.id, (next, fail) =>
    subscribeHighlights(uid, book.id, next, fail),
  );
  const sectionHighlights = useMemo(
    () => (highlights.status === 'ready' ? highlights.data.filter((h) => h.section === section) : []),
    [highlights, section],
  );

  useEffect(() => {
    markOpened(uid, book.id).catch(() => undefined);
  }, [uid, book.id]);

  useEffect(() => {
    let cancelled = false;
    downloadBook(book)
      .then((bytes) => {
        if (!cancelled) {
          setData(bytes);
          setState('ready');
        }
      })
      .catch(() => !cancelled && setState('download-failed'));
    return () => {
      cancelled = true;
    };
    // The file never changes for a book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Save reading progress (debounced).
  useEffect(() => {
    const progress = Math.min(1, (section + fraction) / Math.max(1, count));
    const position =
      book.format === 'pdf'
        ? { page: section + 1 }
        : { chapter: section, fraction: Number(fraction.toFixed(3)) };
    const id = window.setTimeout(() => {
      saveProgress(uid, book.id, progress, position).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(id);
  }, [uid, book.id, book.format, section, fraction, count]);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setPaneSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      setSection(clamped);
      setFraction(0);
      setSelection(null);
      setClicked(null);
    },
    [count],
  );

  const onLoaded = useCallback(
    (info: { count: number }) => {
      setCount(info.count);
      setSection((s) => Math.min(s, info.count - 1));
      if (info.count !== book.pageCount)
        updateBookMeta(uid, book.id, { pageCount: info.count }).catch(() => undefined);
    },
    [uid, book.id, book.pageCount],
  );

  function onDividerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDividerMove(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.min(0.7, Math.max(0.3, (e.clientX - rect.left) / rect.width));
    setSplit(next);
  }
  function persistSplit(value = split) {
    try {
      localStorage.setItem(SPLIT_KEY, String(value));
    } catch {
      // Not critical.
    }
  }
  function onDividerKey(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(0.7, Math.max(0.3, split + delta));
    setSplit(next);
    persistSplit(next);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (
      (e.target as HTMLElement).closest(
        'input, textarea, [contenteditable="true"], [role="separator"], canvas',
      )
    )
      return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(section + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(section - 1);
    else return;
    e.preventDefault();
  }

  const sectionLabel = t(
    book.format === 'pdf' ? 'reader.pageOf' : book.format === 'epub' ? 'reader.chapterOf' : 'reader.partOf',
    {
      page: section + 1,
      count,
    },
  );

  const bookPane = (
    <section aria-label={t('reader.book')} className="flex h-full min-w-0 flex-col" onKeyDown={onKey}>
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line bg-surface px-3">
        <h2 className="text-sm font-semibold text-ink" aria-live="polite">
          {sectionLabel}
        </h2>
        <div className="flex">
          <IconButton
            icon="chevronLeft"
            label={t('reader.prev')}
            disabled={section === 0}
            onClick={() => go(section - 1)}
          />
          <IconButton
            icon="chevronRight"
            label={t('reader.next')}
            disabled={section >= count - 1}
            onClick={() => go(section + 1)}
          />
        </div>
      </div>
      <div ref={paneRef} className="relative min-h-0 flex-1 bg-canvas">
        {state === 'downloading' && <FullPageLoader />}
        {state === 'download-failed' && (
          <div className="p-6">
            <Alert tone="error">{t('reader.downloadFailed')}</Alert>
          </div>
        )}
        {state === 'open-failed' && (
          <div className="p-6">
            <Alert tone="error">{t('reader.failed')}</Alert>
          </div>
        )}
        {state === 'ready' && data && (
          <BookView
            book={book}
            data={data}
            section={section}
            highlights={sectionHighlights}
            onLoaded={onLoaded}
            onFailed={() => setState('open-failed')}
            onSelection={(s) => {
              setSelection(s);
              if (s) setClicked(null);
            }}
            onHighlightClick={(id, rect) => setClicked({ id, rect })}
            onScrollFraction={setFraction}
          />
        )}
        {selection && (
          <SelectionPopover
            at={selection.rect}
            bounds={paneSize}
            label={t('reader.selection')}
            actions={[
              {
                label: 'reader.highlight',
                icon: 'highlighter',
                onSelect: () => {
                  addHighlight(uid, book.id, { section, ...selection.quote })
                    .then(() => toast.success(t('reader.highlighted')))
                    .catch(() => toast.error(t('reader.highlightFailed')));
                  window.getSelection()?.removeAllRanges();
                  setSelection(null);
                },
              },
              {
                label: 'reader.createFlashcard',
                icon: 'cards',
                onSelect: () => {
                  setCardText(selection.quote.exact);
                  setSelection(null);
                },
              },
              { label: 'reader.explain', icon: 'sparkle', comingSoon: true },
              { label: 'reader.summarize', icon: 'sparkle', comingSoon: true },
              { label: 'reader.translate', icon: 'sparkle', comingSoon: true },
            ]}
          />
        )}
        {clicked && !selection && (
          <SelectionPopover
            at={clicked.rect}
            bounds={paneSize}
            label={t('reader.highlight')}
            actions={[
              {
                label: 'reader.removeHighlight',
                icon: 'trash',
                danger: true,
                onSelect: () => {
                  removeHighlight(uid, book.id, clicked.id).catch(() =>
                    toast.error(t('reader.highlightFailed')),
                  );
                  setClicked(null);
                },
              },
              { label: 'common.cancel', icon: 'x', onSelect: () => setClicked(null) },
            ]}
          />
        )}
      </div>
      <p className="hidden border-t border-line bg-surface px-3 py-2 text-center text-xs text-ink-muted sm:block">
        {t('reader.selectTip')} · {section + 1}
      </p>
    </section>
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="flex min-h-14 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
        <Link
          to="/library"
          aria-label={t('reader.back')}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-primary-soft"
        >
          <Icon name="arrowLeft" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink-muted">
            {[FORMAT_LABEL[book.format], book.author].filter(Boolean).join(' · ')}
          </p>
          <h1 className="truncate text-sm font-semibold text-ink sm:text-base">{book.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => setParams(withNotes ? {} : { notes: '1' }, { replace: true })}
          aria-pressed={withNotes}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-primary-soft"
        >
          <Icon name="file" size={18} /> {withNotes ? t('reader.closeNotes') : t('reader.withNotes')}
        </button>
      </header>

      {withNotes && (
        <div className="flex justify-center border-b border-line bg-surface p-1 md:hidden">
          <Segmented
            label={t('notebook.view')}
            value={mobileTab}
            onChange={setMobileTab}
            options={[
              { value: 'book', label: t('reader.book') },
              { value: 'notes', label: t('reader.notes') },
            ]}
          />
        </div>
      )}

      {cardText !== null && <CreateFlashcardDialog text={cardText} onClose={() => setCardText(null)} />}
      <div ref={bodyRef} className="flex min-h-0 flex-1">
        {!withNotes && <div className="min-w-0 flex-1">{bookPane}</div>}
        {withNotes && (
          <>
            {/* Mobile: tabs. Tablet and desktop: side by side with a resizable divider. */}
            <div
              className={`min-w-0 ${mobileTab === 'book' ? 'flex-1' : 'hidden'} md:block md:flex-none`}
              style={{ flexBasis: `${split * 100}%` }}
            >
              {bookPane}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('reader.resize')}
              aria-valuemin={30}
              aria-valuemax={70}
              aria-valuenow={Math.round(split * 100)}
              tabIndex={0}
              onPointerDown={onDividerDown}
              onPointerMove={onDividerMove}
              onPointerUp={() => persistSplit()}
              onKeyDown={onDividerKey}
              style={{ touchAction: 'none' }}
              className="hidden w-3 shrink-0 cursor-col-resize items-center justify-center border-x border-line bg-surface-sunken md:flex"
            >
              <span aria-hidden="true" className="h-10 w-1 rounded-full bg-line-strong" />
            </div>
            <div className={`min-w-0 flex-1 ${mobileTab === 'notes' ? 'block' : 'hidden'} md:block`}>
              <NotesPane book={book} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReaderRoute() {
  const { uid } = useSignedInUser();
  const { bookId = '' } = useParams();
  const validId = /^[A-Za-z0-9]{1,40}$/.test(bookId) ? bookId : null;
  const live = useLive<Book | null>(validId, (next, fail) =>
    validId ? subscribeBook(uid, validId, next, fail) : () => undefined,
  );
  if (!validId || (live.status === 'ready' && !live.data))
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold text-ink">{t('reader.notFound')}</h1>
        <Link to="/library" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('reader.back')}
        </Link>
      </main>
    );
  if (live.status === 'error')
    return (
      <main role="alert" className="flex min-h-dvh items-center justify-center p-6 text-ink">
        {t('reader.downloadFailed')}
      </main>
    );
  if (live.status === 'loading' || !live.data) return <FullPageLoader />;
  return <Reader key={live.data.id} book={live.data} />;
}

/** Full-screen reader (outside the app shell). */
export function ReaderPage() {
  return (
    <SubjectsProvider>
      <ReaderRoute />
    </SubjectsProvider>
  );
}
