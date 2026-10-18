import { describe, expect, it } from 'vitest';
import { cleanContent, isOwnImage, isSafeHref } from './clean';

const own = `/api/files/images/${'a'.repeat(32)}.png`;

describe('cleanContent', () => {
  it('keeps normal formatting', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Newton' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'F = ma',
              marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
        { type: 'image', attrs: { src: own, alt: 'diagram' } },
      ],
    };
    expect(cleanContent(doc)).toEqual(doc);
  });

  it('drops scripts, unknown nodes, unsafe links, and foreign images', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        {
          type: 'paragraph',
          attrs: { onclick: 'x' },
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'fontFamily' }],
            },
          ],
        },
        { type: 'image', attrs: { src: 'https://tracker.example/pixel.png' } },
        { type: 'image', attrs: { src: '/api/files/images/../../etc/passwd' } },
        { type: 'image', attrs: { src: `//evil.example${own}` } },
        { type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'h' }] },
      ],
    };
    expect(cleanContent(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'click' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'h' }] },
      ],
    });
  });

  it('returns an empty document for garbage', () => {
    for (const raw of [null, 'x', { type: 'paragraph' }, { type: 'doc', content: [] }])
      expect(cleanContent(raw)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('survives absurd nesting', () => {
    let node: Record<string, unknown> = { type: 'text', text: 'deep' };
    for (let i = 0; i < 500; i++) node = { type: 'blockquote', content: [node] };
    expect(() => cleanContent({ type: 'doc', content: [node] })).not.toThrow();
  });
});

describe('url checks', () => {
  it('allows only web and mail links', () => {
    expect(isSafeHref('https://a.b')).toBe(true);
    expect(isSafeHref('mailto:a@b.co')).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      'file:///etc/passwd',
      '/relative',
      7,
    ])
      expect(isSafeHref(bad)).toBe(false);
  });
  it('only accepts images served by the local server', () => {
    expect(isOwnImage(own)).toBe(true);
    for (const bad of [
      `https://evil.example${own}`,
      `${own}?x`,
      '/api/files/books/x.pdf',
      'data:image/png;base64,AAAA',
    ])
      expect(isOwnImage(bad)).toBe(false);
  });
});
