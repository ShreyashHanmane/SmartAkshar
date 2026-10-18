import { useEffect, useState, useSyncExternalStore } from 'react';
import { toStored } from '../../data/elements';
import { addPage, replaceAllPages, savePage, subscribePages, touchNotebook } from '../../data/pages';
import { useOnline } from '../../ui/useOnline';
import { EditorStore } from './editorStore';
import type { Element } from './model';
import { estimateBytes, saveStatus } from './saveState';

/** Connects an EditorStore to Firestore for one notebook. */
export function useNotebookEditor(uid: string, notebookId: string) {
  const online = useOnline();
  const [store] = useState(
    () =>
      new EditorStore({
        save: (p) => savePage(uid, notebookId, p.id, p.index, p.elements),
        addPage: (index) => addPage(uid, notebookId, index),
        touch: () => void touchNotebook(uid, notebookId).catch(() => undefined),
        measure: (els) => estimateBytes(els.map(toStored)),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (id) => window.clearTimeout(id),
        now: () => Date.now(),
      }),
  );
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(
    () =>
      subscribePages(
        uid,
        notebookId,
        (pages) => store.applyRemote(pages.map(({ id, index, elements }) => ({ id, index, elements }))),
        () => store.failLoad(),
      ),
    [store, uid, notebookId],
  );

  // Send pending edits when leaving; warn before closing the tab with unsent edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!store.hasUnsent()) return;
      store.flush();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      store.flush();
    };
  }, [store]);

  return {
    ...snap,
    status: saveStatus({ dirty: snap.dirty, inFlight: snap.inFlight, failed: snap.failed, online }),
    setElements: (pageId: string, elements: Element[]) => store.setElements(pageId, elements),
    undo: () => store.undo(),
    redo: () => store.redo(),
    newPage: () => store.newPage(),
    retry: () => store.retry(),
    /** Mode switch: rewrites all pages atomically; undo history refers to the old layout, so it is cleared. */
    replaceAll: async (mode: 'paged' | 'infinite', pages: Element[][]) => {
      store.flush();
      await replaceAllPages(
        uid,
        notebookId,
        mode,
        pages,
        snap.pages.map((p) => p.id),
      );
      store.clearHistory();
    },
  };
}
