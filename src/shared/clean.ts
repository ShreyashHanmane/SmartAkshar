/**
 * Cleans Tiptap JSON. Runs in the browser (on load, paste, and save) and on the
 * server (on save). Treats notes as untrusted: only known node and mark types
 * survive, links must be http(s) or mailto, and images must be the user's own
 * uploads served by the local server (no remote resources from user content).
 */
export interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const NODES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'image',
]);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);
const MAX_DEPTH = 40;
const MAX_NODES = 40_000;

export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 2048) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** Images must be uploads served by the local server (the server only serves a file to its owner). */
const IMAGE_PATH = /^\/api\/files\/images\/[0-9a-f]{32}\.(png|jpg|gif|webp)$/;

export function isOwnImage(src: unknown): src is string {
  return typeof src === 'string' && IMAGE_PATH.test(src);
}

export function cleanContent(raw: unknown): JsonNode {
  let count = 0;
  const empty: JsonNode = { type: 'doc', content: [{ type: 'paragraph' }] };

  function walk(node: unknown, depth: number): JsonNode | null {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH || ++count > MAX_NODES) return null;
    const n = node as Record<string, unknown>;
    if (typeof n.type !== 'string' || !NODES.has(n.type)) return null;
    const out: JsonNode = { type: n.type };

    if (n.type === 'text') {
      if (typeof n.text !== 'string' || n.text.length === 0) return null;
      out.text = n.text.slice(0, 100_000);
    }
    if (n.type === 'heading') {
      const level = (n.attrs as Record<string, unknown> | undefined)?.level;
      out.attrs = { level: level === 1 || level === 2 || level === 3 ? level : 2 };
    }
    if (n.type === 'orderedList') {
      const start = (n.attrs as Record<string, unknown> | undefined)?.start;
      out.attrs = {
        start:
          typeof start === 'number' && Number.isInteger(start) && start > 0 && start < 100_000 ? start : 1,
      };
    }
    if (n.type === 'image') {
      const attrs = (n.attrs ?? {}) as Record<string, unknown>;
      if (!isOwnImage(attrs.src)) return null;
      out.attrs = { src: attrs.src, alt: typeof attrs.alt === 'string' ? attrs.alt.slice(0, 300) : null };
    }
    if (Array.isArray(n.marks)) {
      const marks = n.marks.flatMap((m: unknown) => {
        if (!m || typeof m !== 'object') return [];
        const mark = m as { type?: unknown; attrs?: Record<string, unknown> };
        if (typeof mark.type !== 'string' || !MARKS.has(mark.type)) return [];
        if (mark.type === 'link')
          return isSafeHref(mark.attrs?.href) ? [{ type: 'link', attrs: { href: mark.attrs?.href } }] : [];
        return [{ type: mark.type }];
      });
      if (marks.length) out.marks = marks;
    }
    if (Array.isArray(n.content)) {
      const children = n.content.flatMap((c) => walk(c, depth + 1) ?? []);
      if (children.length) out.content = children;
    }
    return out;
  }

  const root = walk(raw, 0);
  if (!root || root.type !== 'doc') return empty;
  return root.content?.length ? root : empty;
}
