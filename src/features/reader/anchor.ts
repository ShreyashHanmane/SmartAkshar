/**
 * Text-quote anchors (like the W3C TextQuoteSelector): a highlight is stored
 * as the exact text plus a little context, then found again by searching. This
 * survives reflow (EPUB, TXT) and works on the PDF text layer too.
 */
export interface Quote {
  exact: string;
  prefix: string;
  suffix: string;
}

const CONTEXT = 32;
export const MAX_QUOTE = 2000;

export function makeQuote(text: string, start: number, end: number): Quote {
  return {
    exact: text.slice(start, end).slice(0, MAX_QUOTE),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

function sharedSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function sharedPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Start offset of the best occurrence of `quote.exact` (context decides between repeats), or -1. */
export function findQuote(text: string, quote: Quote): number {
  if (!quote.exact) return -1;
  let best = -1;
  let bestScore = -1;
  for (let i = text.indexOf(quote.exact); i !== -1; i = text.indexOf(quote.exact, i + 1)) {
    const score =
      sharedSuffix(text.slice(Math.max(0, i - quote.prefix.length), i), quote.prefix) +
      sharedPrefix(
        text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length),
        quote.suffix,
      );
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Text nodes under `root` with their offsets in the concatenated text. */
function textIndex(root: Node) {
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker?.nextNode(); n; n = walker?.nextNode()) {
    nodes.push({ node: n as Text, start: text.length });
    text += (n as Text).data;
  }
  return { nodes, text };
}

function locate(nodes: { node: Text; start: number }[], offset: number) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const entry = nodes[i];
    if (entry && entry.start <= offset)
      return { node: entry.node, offset: Math.min(offset - entry.start, entry.node.data.length) };
  }
  return null;
}

/** DOM Range for a quote inside `root`, or null when it can't be found. */
export function rangeForQuote(root: Node, quote: Quote): Range | null {
  const { nodes, text } = textIndex(root);
  const start = findQuote(text, quote);
  if (start < 0) return null;
  const a = locate(nodes, start);
  const b = locate(nodes, start + quote.exact.length);
  const doc = root.ownerDocument;
  if (!a || !b || !doc) return null;
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** Quote for the current selection range, if it lies inside `root`. */
export function quoteForRange(root: Node, range: Range): Quote | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const { nodes, text } = textIndex(root);
  const offsetOf = (container: Node, offset: number) => {
    if (container.nodeType === Node.TEXT_NODE) {
      const entry = nodes.find((n) => n.node === container);
      return entry ? entry.start + offset : -1;
    }
    // Element boundary: offset counts child nodes; use the next text node's start.
    const child = container.childNodes[offset];
    const next = nodes.find((n) => child && (n.node === child || child.contains(n.node)));
    return next ? next.start : text.length;
  };
  const start = offsetOf(range.startContainer, range.startOffset);
  const end = offsetOf(range.endContainer, range.endOffset);
  if (start < 0 || end <= start) return null;
  const quote = makeQuote(text, start, end);
  return quote.exact.trim() ? quote : null;
}
