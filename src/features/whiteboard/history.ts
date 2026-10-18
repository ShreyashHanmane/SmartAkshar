import type { Element } from './model';

/** One undoable change: the elements of one page before and after. */
export interface Change {
  pageId: string;
  before: Element[];
  after: Element[];
}

const LIMIT = 200;

/** Immutable undo/redo stacks of page snapshots (elements are immutable and shared). */
export interface History {
  undo: Change[];
  redo: Change[];
}

export const emptyHistory: History = { undo: [], redo: [] };

export function record(history: History, change: Change): History {
  if (change.before === change.after) return history;
  return { undo: [...history.undo, change].slice(-LIMIT), redo: [] };
}

/** Returns the page state to apply and the new history, or null when there is nothing to undo. */
export function undo(history: History): { history: History; pageId: string; elements: Element[] } | null {
  const change = history.undo.at(-1);
  if (!change) return null;
  return {
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, change] },
    pageId: change.pageId,
    elements: change.before,
  };
}

export function redo(history: History): { history: History; pageId: string; elements: Element[] } | null {
  const change = history.redo.at(-1);
  if (!change) return null;
  return {
    history: { undo: [...history.undo, change], redo: history.redo.slice(0, -1) },
    pageId: change.pageId,
    elements: change.after,
  };
}
