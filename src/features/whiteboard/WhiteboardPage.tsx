import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { useSettings } from '../../app/settings/SettingsProvider';
import { useStudyTracker } from '../../app/study/useStudyTracker';
import { LOCAL_KEY_PREFIX } from '../../data/auth';
import { toStored } from '../../data/elements';
import { type Notebook, subscribeNotebook, updateNotebook } from '../../data/notebooks';
import { useLive } from '../../data/useLive';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { FullPageLoader } from '../../ui/FullPageLoader';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { NotesEditor } from '../notes/NotesEditor';
import { AiPanel, type AiSource } from '../ai/AiPanel';
import { ExportDialog, useQuickExport } from '../export/ExportDialog';
import { notesDocx, notesPdf, safeFileName, whiteboardPdf, whiteboardPng } from '../export/exporters';
import type { JsonNode } from '../../shared/clean';
import type { AiAction } from '../../shared/schemas';
import { elementsToPng } from './snapshot';
import type { SaveStatus } from './saveState';
import { DeleteNotebookDialog, RenameNotebookDialog } from '../notebooks/NotebookDialogs';
import { SubjectsProvider, useSubject } from '../subjects/SubjectsProvider';
import { BottomBar, SavedChip, TopBar } from './Bars';
import type { Element } from './model';
import { infiniteToPages, pagesToInfinite } from './modes';
import { defaultInk } from './paper';
import { PAGE_BYTES_LIMIT, estimateBytes } from './saveState';
import { type Dock, INK_COLORS, Toolbar } from './Toolbar';
import { useNotebookEditor } from './useNotebookEditor';
import { FIT, type ViewState, clampZoom } from './viewport';
import { type ToolName, type ToolState, WhiteboardCanvas } from './WhiteboardCanvas';

const TOOLS_KEY = `${LOCAL_KEY_PREFIX}wb:tools`;
const DOCK_KEY = `${LOCAL_KEY_PREFIX}wb:dock`;
const DEFAULT_TOOL: ToolState = {
  tool: 'pen',
  color: INK_COLORS[0].value,
  penWidth: 3,
  hlOpacity: 40,
  textSize: 32,
  font: 'sans',
  shape: 'rect',
};

function readJson<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not critical: preferences fall back to defaults.
  }
}

/** Validates remembered tool settings (localStorage is untrusted input). */
function loadTools(): ToolState {
  const raw = readJson<ToolState>(TOOLS_KEY);
  const tools: ToolName[] = ['lasso', 'pen', 'highlighter', 'eraser', 'shape', 'text'];
  const inRange = (n: unknown, min: number, max: number, d: number) =>
    typeof n === 'number' && n >= min && n <= max ? n : d;
  return {
    tool: tools.includes(raw.tool as ToolName) ? (raw.tool as ToolName) : DEFAULT_TOOL.tool,
    color:
      typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_TOOL.color,
    penWidth: inRange(raw.penWidth, 1, 24, DEFAULT_TOOL.penWidth),
    hlOpacity: inRange(raw.hlOpacity, 10, 80, DEFAULT_TOOL.hlOpacity),
    textSize: inRange(raw.textSize, 16, 96, DEFAULT_TOOL.textSize),
    font: raw.font === 'serif' || raw.font === 'hand' ? raw.font : 'sans',
    shape: raw.shape === 'ellipse' || raw.shape === 'line' || raw.shape === 'arrow' ? raw.shape : 'rect',
  };
}

export function Editor({
  notebook,
  tab,
  onTab,
  embedded = false,
}: {
  notebook: Notebook;
  tab: 'whiteboard' | 'notes';
  onTab: (v: 'whiteboard' | 'notes') => void;
  /** Inside another screen (the reader's notes pane): compact header, no notebook menu. */
  embedded?: boolean;
}) {
  const { uid } = useSignedInUser();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const subject = useSubject(notebook.subjectId);
  const editor = useNotebookEditor(uid, notebook.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<ToolState>(loadTools);
  const [dockState, setDockState] = useState<{ dock?: Dock; collapsed?: boolean }>(() => readJson(DOCK_KEY));
  const [pageIndex, setPageIndex] = useState(0);
  const [view, setView] = useState<ViewState>(FIT);
  const [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'pdf' | 'notesPdf' | null>(null);
  const notesContent = useRef<(() => JsonNode | null) | null>(null);
  const quickExport = useQuickExport();
  const [confirmPaged, setConfirmPaged] = useState<{ pages: Element[][]; outside: number } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [ai, setAi] = useState<{ source: AiSource; autoRun?: AiAction } | null>(null);
  const [notesSave, setNotesSave] = useState<{ status: SaveStatus; retry: () => void }>({
    status: 'saved',
    retry: () => undefined,
  });
  const onNotesStatus = useCallback(
    (status: SaveStatus, retry: () => void) => setNotesSave({ status, retry }),
    [],
  );
  useStudyTracker(tab === 'whiteboard' && !embedded);

  const isSmall = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const dock: Dock = dockState.dock ?? (isSmall ? 'bottom' : settings.toolbarSide);
  const collapsed = dockState.collapsed ?? false;
  const mode = notebook.mode;
  const pages = editor.pages;
  const index = mode === 'infinite' ? 0 : Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[index];

  const updateTool = useCallback((patch: Partial<ToolState>) => {
    setTool((prev) => {
      const next = { ...prev, ...patch };
      writeJson(TOOLS_KEY, next);
      return next;
    });
  }, []);
  const updateDock = (patch: { dock?: Dock; collapsed?: boolean }) => {
    const next = { dock, collapsed, ...patch };
    setDockState(next);
    writeJson(DOCK_KEY, next);
  };

  // On dark paper the default navy ink would be invisible: draw it in a light ink instead.
  const effectiveTool: ToolState =
    notebook.background === 'slate' && tool.color === INK_COLORS[0].value
      ? { ...tool, color: defaultInk('slate') }
      : tool;

  const insets = useMemo(() => {
    const bar = collapsed ? 76 : 80;
    if (dock === 'left') return { left: bar, right: 0, top: 0, bottom: 0 };
    if (dock === 'right') return { left: 0, right: bar, top: 0, bottom: 0 };
    return { left: 0, right: 0, top: 0, bottom: bar };
  }, [dock, collapsed]);

  const goToPage = (i: number) => {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, i)));
    setView(FIT);
  };

  const addPage = () => {
    editor.newPage();
    setPageIndex(pages.length);
    setView(FIT);
  };

  async function switchMode(next: 'paged' | 'infinite') {
    if (next === mode || switching) return;
    if (next === 'infinite') {
      const merged = pagesToInfinite(pages.map((p) => p.elements));
      if (estimateBytes(merged.map(toStored)) > PAGE_BYTES_LIMIT) {
        toast.error(t('whiteboard.mode.tooBig'));
        return;
      }
      await runSwitch('infinite', [merged]);
    } else {
      const split = infiniteToPages(page?.elements ?? []);
      if (split.outside > 0) setConfirmPaged(split);
      else await runSwitch('paged', split.pages);
    }
  }

  async function runSwitch(next: 'paged' | 'infinite', nextPages: Element[][]) {
    setSwitching(true);
    try {
      await editor.replaceAll(next, nextPages);
      setPageIndex(0);
      setView(FIT);
      toast.success(next === 'infinite' ? t('whiteboard.mode.nowInfinite') : t('whiteboard.mode.nowPaged'));
    } catch {
      toast.error(t('whiteboard.mode.failed'));
    } finally {
      setSwitching(false);
      setConfirmPaged(null);
    }
  }

  // Focus mode: hide the bars and go full screen where supported.
  const enterFocus = () => {
    setFocus(true);
    rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const exitFocus = useCallback(() => {
    setFocus(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (mod || e.altKey) return;
      const tools: Record<string, ToolName> = {
        p: 'pen',
        h: 'highlighter',
        e: 'eraser',
        l: 'lasso',
        s: 'shape',
        t: 'text',
      };
      if (tools[key]) updateTool({ tool: tools[key] });
      else if (e.key === 'PageDown') goToPage(index + 1);
      else if (e.key === 'PageUp') goToPage(index - 1);
      else if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.2) }));
      else if (e.key === '-') setView((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.2) }));
      else if (e.key === '0') setView(FIT);
      else if (e.key === 'Escape' && focus) exitFocus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const menu = [
    { label: t('whiteboard.focus'), icon: 'focus' as const, onSelect: enterFocus },
    { label: t('whiteboard.exportPdf'), icon: 'download' as const, onSelect: () => setDialog('pdf') },
    {
      label: t('whiteboard.exportImage'),
      icon: 'download' as const,
      onSelect: () =>
        void quickExport(async () => ({
          blob: await whiteboardPng(page?.elements ?? [], notebook),
          name: safeFileName(
            mode === 'paged' && pages.length > 1 ? `${notebook.title} p${index + 1}` : notebook.title,
            'png',
          ),
        })),
    },
    { label: t('notebooks.rename'), icon: 'pencil' as const, onSelect: () => setDialog('rename') },
    { label: t('common.delete'), icon: 'trash' as const, danger: true, onSelect: () => setDialog('delete') },
  ];

  /** The notes as shown in the editor (including edits not yet saved). */
  function currentNotes(): JsonNode {
    const doc = notesContent.current?.();
    if (!doc) throw new Error('Notes are still loading');
    return doc;
  }

  const exportDialogs = (
    <>
      {dialog === 'pdf' && (
        <ExportDialog
          title={t('whiteboard.exportPdf')}
          {...(mode === 'paged' && pages.length > 1
            ? {
                choices: {
                  label: t('export.pages'),
                  options: [
                    { value: 'page' as const, label: t('export.thisPage', { n: index + 1 }) },
                    { value: 'all' as const, label: t('export.allPages', { count: pages.length }) },
                  ],
                },
              }
            : {})}
          run={async (choice, progress) => {
            const selected = choice === 'all' ? pages : page ? [page] : [];
            const blob = await whiteboardPdf(
              selected.length ? selected.map((p) => p.elements) : [[]],
              notebook,
              progress,
            );
            return { blob, name: safeFileName(notebook.title, 'pdf') };
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'notesPdf' && (
        <ExportDialog
          title={t('notes.exportPdf')}
          description={t('export.notesPdfHint')}
          run={async (_choice, progress) => ({
            blob: await notesPdf(currentNotes(), notebook.title, progress),
            name: safeFileName(`${notebook.title} notes`, 'pdf'),
          })}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  // AI: an image of only the strokes asked about (the whole page from the sparkle, or the lasso selection).
  function openAi(elements: Element[], label: string, autoRun?: AiAction) {
    const png = elementsToPng(elements);
    if (!png) {
      toast.info(t('ai.nothingToSend'));
      return;
    }
    setAi({ source: { kind: 'image', png, label }, ...(autoRun ? { autoRun } : {}) });
  }

  const notesMenu = [
    { label: t('notes.exportPdf'), icon: 'download' as const, onSelect: () => setDialog('notesPdf') },
    {
      label: t('notes.exportDocx'),
      icon: 'download' as const,
      onSelect: () =>
        void quickExport(async () => ({
          blob: await notesDocx(currentNotes(), notebook.title),
          name: safeFileName(notebook.title, 'docx'),
        })),
    },
    { label: t('notebooks.rename'), icon: 'pencil' as const, onSelect: () => setDialog('rename') },
    { label: t('common.delete'), icon: 'trash' as const, danger: true, onSelect: () => setDialog('delete') },
  ];

  if (tab === 'notes')
    return (
      <div ref={rootRef} className="flex h-dvh flex-col bg-canvas">
        <TopBar
          title={notebook.title}
          subject={subject}
          status={notesSave.status}
          onRetry={notesSave.retry}
          view={tab}
          onView={onTab}
          menu={notesMenu}
          onAi={() => openAi(page?.elements ?? [], t('ai.thisPage'))}
        />
        <div className="min-h-0 flex-1">
          <NotesEditor notebookId={notebook.id} onStatus={onNotesStatus} contentRef={notesContent} />
        </div>
        {exportDialogs}
        {dialog === 'rename' && <RenameNotebookDialog notebook={notebook} onClose={() => setDialog(null)} />}
        {dialog === 'delete' && (
          <DeleteNotebookDialog
            notebook={notebook}
            onClose={() => setDialog(null)}
            onDeleted={() => navigate('/notebooks')}
          />
        )}
      </div>
    );

  return (
    <div ref={rootRef} className={`flex flex-col bg-canvas ${embedded ? 'h-full' : 'h-dvh'}`}>
      {embedded && (
        <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line bg-surface px-3">
          <h2 className="text-sm font-semibold text-ink">{t('reader.notesPane', { page: index + 1 })}</h2>
          <SavedChip status={editor.status} onRetry={editor.retry} />
        </div>
      )}
      {!focus && !embedded && (
        <TopBar
          title={notebook.title}
          subject={subject}
          status={editor.status}
          onRetry={editor.retry}
          view="whiteboard"
          onView={onTab}
          mode={{ value: mode, onChange: (m) => void switchMode(m) }}
          menu={menu}
          onAi={() => openAi(page?.elements ?? [], t('ai.thisPage'))}
        />
      )}
      <div ref={bodyRef} className="relative min-h-0 flex-1">
        {editor.loadState === 'loading' && <FullPageLoader />}
        {editor.loadState === 'error' && (
          <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-ink">
            {t('whiteboard.loadFailed')}
          </div>
        )}
        {editor.loadState === 'ready' && page && (
          <WhiteboardCanvas
            key={page.id}
            elements={page.elements}
            mode={mode}
            paper={notebook.paper}
            background={notebook.background}
            tool={effectiveTool}
            view={view}
            onViewChange={setView}
            insets={insets}
            onChange={(els) => editor.setElements(page.id, els)}
            onPageFull={() => toast.error(t('whiteboard.pageFull'))}
            onAiSelection={(els, action) => openAi(els, t('ai.selection'), action)}
            label={
              mode === 'paged'
                ? t('whiteboard.canvasPaged', {
                    page: index + 1,
                    count: pages.length,
                    items: page.elements.length,
                  })
                : t('whiteboard.canvasInfinite', { items: page.elements.length })
            }
          />
        )}
        <Toolbar
          tool={effectiveTool}
          onTool={updateTool}
          dock={dock}
          onDock={(d) => updateDock({ dock: d })}
          collapsed={collapsed}
          onCollapsed={(c) => updateDock({ collapsed: c })}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.undo}
          onRedo={editor.redo}
          paper={notebook.paper}
          background={notebook.background}
          onPaper={(paper) =>
            void updateNotebook(uid, notebook.id, { paper }).catch(() =>
              toast.error(t('notebooks.saveFailed')),
            )
          }
          onBackground={(background) =>
            void updateNotebook(uid, notebook.id, { background }).catch(() =>
              toast.error(t('notebooks.saveFailed')),
            )
          }
          container={bodyRef.current}
        />
        {focus && (
          <button
            type="button"
            onClick={exitFocus}
            className="absolute top-3 right-3 z-30 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink shadow"
          >
            <Icon name="x" size={18} /> {t('whiteboard.exitFocus')}
          </button>
        )}
      </div>
      {!focus && (
        <BottomBar
          mode={mode}
          pageIndex={index}
          pageCount={pages.length}
          onPrev={() => goToPage(index - 1)}
          onNext={() => goToPage(index + 1)}
          onAddPage={addPage}
          zoom={view.zoom}
          onZoomIn={() => setView((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.25) }))}
          onZoomOut={() => setView((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.25) }))}
          onFit={() => setView(FIT)}
        />
      )}
      {exportDialogs}
      {dialog === 'rename' && <RenameNotebookDialog notebook={notebook} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <DeleteNotebookDialog
          notebook={notebook}
          onClose={() => setDialog(null)}
          onDeleted={() => navigate('/notebooks')}
        />
      )}
      {ai && (
        <AiPanel
          source={ai.source}
          actions={['handwriting', 'explain', 'translate']}
          autoRun={ai.autoRun}
          notebookId={notebook.id}
          onClose={() => setAi(null)}
        />
      )}
      {confirmPaged && (
        <Dialog
          open
          title={t('whiteboard.mode.confirmTitle')}
          onClose={() => setConfirmPaged(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmPaged(null)}>
                {t('common.cancel')}
              </Button>
              <Button loading={switching} onClick={() => void runSwitch('paged', confirmPaged.pages)}>
                {t('whiteboard.mode.confirm')}
              </Button>
            </>
          }
        >
          {t('whiteboard.mode.confirmBody', { count: confirmPaged.outside })}
        </Dialog>
      )}
    </div>
  );
}

function NotebookRoute() {
  const { uid } = useSignedInUser();
  const { notebookId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'notes' ? 'notes' : 'whiteboard';
  const setView = (v: 'whiteboard' | 'notes') =>
    setParams(v === 'notes' ? { view: 'notes' } : {}, { replace: true });
  const validId = /^[A-Za-z0-9]{1,40}$/.test(notebookId) ? notebookId : null;
  const live = useLive<Notebook | null>(validId, (next, fail) =>
    validId ? subscribeNotebook(uid, validId, next, fail) : () => undefined,
  );

  if (!validId || (live.status === 'ready' && live.data === null))
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold text-ink">{t('whiteboard.notFound')}</h1>
        <Link to="/notebooks" className="font-semibold text-accent underline-offset-2 hover:underline">
          {t('whiteboard.backToNotebooks')}
        </Link>
      </main>
    );
  if (live.status === 'error')
    return (
      <main role="alert" className="flex min-h-dvh items-center justify-center p-6 text-ink">
        {t('whiteboard.loadFailed')}
      </main>
    );
  if (live.status === 'loading' || !live.data) return <FullPageLoader />;
  // Re-mount the editor per notebook so state never leaks between notebooks.
  return <Editor key={live.data.id} notebook={live.data} tab={view} onTab={setView} />;
}

/** Full-screen whiteboard route (outside the app shell, so the tab bar is hidden). */
export function WhiteboardPage() {
  return (
    <SubjectsProvider>
      <NotebookRoute />
    </SubjectsProvider>
  );
}
