import type { Highlight } from '../../data/books';
import { type Quote, quoteForRange, rangeForQuote } from './anchor';

const CLASS = 'akshar-hl';

/** Removes highlight marks, restoring the original text nodes. */
export function clearMarks(root: HTMLElement) {
  for (const mark of [...root.querySelectorAll(`mark.${CLASS}`)]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

/** Wraps the text inside `range` in <mark> elements (one per text node segment). */
function wrapRange(range: Range, id: string) {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return;
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.currentNode; n; n = walker.nextNode() as Node) {
    if (n.nodeType === Node.TEXT_NODE && range.intersectsNode(n)) nodes.push(n as Text);
  }
  for (const node of nodes) {
    let target = node;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    if (end <= start || !node.data.slice(start, end).trim()) continue;
    if (end < target.data.length) target.splitText(end);
    if (start > 0) target = target.splitText(start);
    const mark = doc.createElement('mark');
    mark.className = CLASS;
    mark.dataset.highlight = id;
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
  }
}

/** Draws the given highlights inside `root` (removing any previous marks first). */
export function applyHighlights(root: HTMLElement, highlights: Highlight[]) {
  clearMarks(root);
  for (const h of highlights) {
    const range = rangeForQuote(root, h);
    if (range) wrapRange(range, h.id);
  }
}

/** The current selection inside `root` as a quote plus its on-screen rectangle. */
export function selectionIn(root: HTMLElement): { quote: Quote; rect: DOMRect } | null {
  const win = root.ownerDocument.defaultView;
  const sel = win?.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const quote = quoteForRange(root, range);
  if (!quote) return null;
  return { quote, rect: range.getBoundingClientRect() };
}

export const HIGHLIGHT_CLASS = CLASS;
