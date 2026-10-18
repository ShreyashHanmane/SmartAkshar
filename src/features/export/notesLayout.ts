import type { JsonNode } from '../../shared/clean';

/**
 * Lays out cleaned notes (Tiptap JSON) on A4 pages as simple draw operations.
 * Measuring is injected (canvas measureText in the browser, a stub in tests).
 * Exported pages are documents, not UI, so their colours are fixed here rather
 * than taken from the theme tokens: an export looks the same in every theme.
 */

/** A4 at 96 px per inch. */
export const PAGE = { width: 794, height: 1123, margin: 72 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export const DOC_COLORS = {
  ink: '#1b2430',
  heading: '#0f2a4a',
  muted: '#4a5566',
  link: '#1f5faf',
  rule: '#a0a8b4',
  codeBg: '#eef1f5',
};

export const DOC_FONTS = {
  body: '"Noto Sans", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

export interface TextStyle {
  size: number;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  color: string;
  underline: boolean;
  strike: boolean;
}

export function cssFont(s: TextStyle): string {
  return `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${s.size}px ${s.mono ? DOC_FONTS.mono : DOC_FONTS.body}`;
}

export type Op =
  | { kind: 'text'; x: number; y: number; text: string; style: TextStyle }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'image'; x: number; y: number; w: number; h: number; src: string };

export type Measure = (text: string, style: TextStyle) => number;

interface Token {
  text: string;
  style: TextStyle;
  space: boolean;
  /** Forced line break (hardBreak or code line end). */
  br?: boolean;
}

const BASE: TextStyle = {
  size: 15,
  bold: false,
  italic: false,
  mono: false,
  color: DOC_COLORS.ink,
  underline: false,
  strike: false,
};

function inlineTokens(nodes: JsonNode[] | undefined, base: TextStyle): Token[] {
  const out: Token[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push({ text: '', style: base, space: false, br: true });
      continue;
    }
    if (node.type !== 'text' || !node.text) continue;
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    const style: TextStyle = {
      ...base,
      bold: base.bold || marks.has('bold'),
      italic: base.italic || marks.has('italic'),
      mono: base.mono || marks.has('code'),
      strike: marks.has('strike'),
      underline: marks.has('underline') || marks.has('link'),
      color: marks.has('link') ? DOC_COLORS.link : base.color,
      size: marks.has('code') && !base.mono ? base.size - 1 : base.size,
    };
    for (const part of node.text.split(/(\s+)/))
      if (part) out.push({ text: part, style, space: /^\s+$/.test(part) });
  }
  return out;
}

export class NotesLayout {
  readonly pages: Op[][] = [[]];
  private y = PAGE.margin;
  private readonly measure: Measure;
  private readonly imageSize: (src: string) => { width: number; height: number } | null;

  constructor(measure: Measure, imageSize: (src: string) => { width: number; height: number } | null) {
    this.measure = measure;
    this.imageSize = imageSize;
  }

  private get page(): Op[] {
    return this.pages[this.pages.length - 1] as Op[];
  }

  private newPage() {
    this.pages.push([]);
    this.y = PAGE.margin;
  }

  /** Makes room for `h` px, starting a new page when it doesn't fit (unless the page is empty). */
  private reserve(h: number) {
    if (this.y + h > PAGE.height - PAGE.margin && this.y > PAGE.margin) this.newPage();
  }

  private gap(h: number) {
    if (this.y > PAGE.margin) this.y += h;
  }

  /** Splits a token that is wider than the line into pieces that fit (long words, scripts without spaces). */
  private split(token: Token, width: number): Token[] {
    if (this.measure(token.text, token.style) <= width) return [token];
    const out: Token[] = [];
    let current = '';
    for (const ch of Array.from(token.text)) {
      if (current && this.measure(current + ch, token.style) > width) {
        out.push({ ...token, text: current });
        current = '';
      }
      current += ch;
    }
    if (current) out.push({ ...token, text: current });
    return out;
  }

  /** Wraps tokens into lines within [x, x + width] and draws them. */
  private flow(
    tokens: Token[],
    x: number,
    width: number,
    opts: { lineHeight?: number; marker?: Token; bg?: string } = {},
  ) {
    const size = Math.max(BASE.size, ...tokens.map((t) => t.style.size));
    const lineHeight = opts.lineHeight ?? Math.round(size * 1.55);
    const lines: Token[][] = [[]];
    let used = 0;
    for (const raw of tokens) {
      if (raw.br) {
        lines.push([]);
        used = 0;
        continue;
      }
      for (const token of this.split(raw, width)) {
        const w = this.measure(token.text, token.style);
        const line = lines[lines.length - 1] as Token[];
        if (used + w > width && line.length > 0) {
          if (token.space) continue; // a space that would wrap is simply dropped
          lines.push([token]);
          used = w;
        } else {
          line.push(token);
          used += w;
        }
      }
    }
    lines.forEach((line, i) => {
      while (
        line.length &&
        (line[line.length - 1] as Token).space &&
        !(line[line.length - 1] as Token).style.mono
      )
        line.pop();
      this.reserve(lineHeight);
      if (opts.bg)
        this.page.push({ kind: 'rect', x: x - 8, y: this.y, w: width + 16, h: lineHeight, color: opts.bg });
      const baseline = this.y + Math.round(lineHeight * 0.72);
      if (i === 0 && opts.marker)
        this.page.push({
          kind: 'text',
          x: x - 22,
          y: baseline,
          text: opts.marker.text,
          style: opts.marker.style,
        });
      let cx = x;
      for (const t of line) {
        const w = this.measure(t.text, t.style);
        if (!t.space || t.style.mono)
          this.page.push({ kind: 'text', x: cx, y: baseline, text: t.text, style: t.style });
        const thickness = Math.max(1, t.style.size / 15);
        if (t.style.underline)
          this.page.push({ kind: 'rect', x: cx, y: baseline + 2, w, h: thickness, color: t.style.color });
        if (t.style.strike)
          this.page.push({
            kind: 'rect',
            x: cx,
            y: baseline - t.style.size * 0.3,
            w,
            h: thickness,
            color: t.style.color,
          });
        cx += w;
      }
      this.y += lineHeight;
    });
  }

  title(text: string) {
    this.flow(
      inlineTokens([{ type: 'text', text }], { ...BASE, size: 28, bold: true, color: DOC_COLORS.heading }),
      PAGE.margin,
      CONTENT_WIDTH,
    );
    this.y += 12;
  }

  blocks(nodes: JsonNode[] | undefined, indent = 0, quote = false) {
    for (const node of nodes ?? []) this.block(node, indent, quote);
  }

  private block(node: JsonNode, indent: number, quote: boolean) {
    const x = PAGE.margin + indent;
    const width = CONTENT_WIDTH - indent;
    const base: TextStyle = quote ? { ...BASE, italic: true, color: DOC_COLORS.muted } : BASE;
    switch (node.type) {
      case 'paragraph': {
        this.gap(8);
        const top = { page: this.pages.length, y: this.y };
        this.flow(inlineTokens(node.content, base), x, width);
        if (!node.content?.length) this.y += Math.round(BASE.size * 1.55); // empty line
        if (quote) this.quoteBar(top, indent);
        return;
      }
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
        const size = [0, 24, 20, 17][level] as number;
        this.gap(16);
        this.reserve(size * 3); // keep a heading with the line after it
        this.flow(
          inlineTokens(node.content, { ...base, size, bold: true, color: DOC_COLORS.heading }),
          x,
          width,
        );
        return;
      }
      case 'blockquote':
        this.blocks(node.content, indent + 18, true);
        return;
      case 'codeBlock': {
        this.gap(8);
        const style: TextStyle = { ...BASE, mono: true, size: 13 };
        const text = (node.content ?? []).map((n) => n.text ?? '').join('');
        const tokens: Token[] = [];
        text.split('\n').forEach((line, i) => {
          if (i > 0) tokens.push({ text: '', style, space: false, br: true });
          for (const part of line.split(/(\s+)/))
            if (part) tokens.push({ text: part, style, space: /^\s+$/.test(part) });
        });
        this.flow(tokens, x + 8, width - 16, { lineHeight: 20, bg: DOC_COLORS.codeBg });
        return;
      }
      case 'horizontalRule':
        this.gap(12);
        this.reserve(13);
        this.page.push({ kind: 'rect', x, y: this.y + 6, w: width, h: 1, color: DOC_COLORS.rule });
        this.y += 13;
        return;
      case 'image': {
        const src = node.attrs?.src;
        const size = typeof src === 'string' ? this.imageSize(src) : null;
        if (typeof src !== 'string' || !size || size.width <= 0 || size.height <= 0) return;
        const maxH = PAGE.height - PAGE.margin * 2;
        const scale = Math.min(1, width / size.width, maxH / size.height);
        const w = Math.round(size.width * scale);
        const h = Math.round(size.height * scale);
        this.gap(10);
        this.reserve(h);
        this.page.push({ kind: 'image', x, y: this.y, w, h, src });
        this.y += h;
        return;
      }
      case 'bulletList':
      case 'orderedList': {
        let n = Math.max(1, Number(node.attrs?.start) || 1);
        for (const item of node.content ?? []) {
          const marker: Token = {
            text: node.type === 'bulletList' ? '•' : `${n++}.`,
            style: { ...base, bold: node.type === 'orderedList' },
            space: false,
          };
          let first = true;
          for (const child of item.content ?? []) {
            if (child.type === 'paragraph' && first) {
              this.gap(6);
              const top = { page: this.pages.length, y: this.y };
              this.flow(inlineTokens(child.content, base), x + 26, width - 26, { marker });
              if (quote) this.quoteBar(top, indent);
              first = false;
            } else this.block(child, indent + 26, quote);
          }
        }
        return;
      }
      default:
    }
  }

  /** Left bar beside quoted text, on every page the quote spans. */
  private quoteBar(top: { page: number; y: number }, indent: number) {
    for (let p = top.page; p <= this.pages.length; p++) {
      const y1 = p === top.page ? top.y : PAGE.margin;
      const y2 = p === this.pages.length ? this.y : PAGE.height - PAGE.margin;
      (this.pages[p - 1] as Op[]).push({
        kind: 'rect',
        x: PAGE.margin + indent - 14,
        y: y1,
        w: 3,
        h: Math.max(0, y2 - y1),
        color: DOC_COLORS.rule,
      });
    }
  }
}

export function layoutNotes(
  doc: JsonNode,
  title: string,
  measure: Measure,
  imageSize: (src: string) => { width: number; height: number } | null,
): Op[][] {
  const layout = new NotesLayout(measure, imageSize);
  layout.title(title);
  layout.blocks(doc.content);
  return layout.pages;
}

/** Collects the image sources a note uses. */
export function noteImages(doc: JsonNode): string[] {
  const out: string[] = [];
  const walk = (n: JsonNode) => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string') out.push(n.attrs.src);
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...new Set(out)];
}
