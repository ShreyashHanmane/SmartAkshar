import { describe, expect, it } from 'vitest';
import type { JsonNode } from '../../shared/clean';
import { unzip } from '../../shared/zip';
import { buildDocx, xmlText } from './docx';

const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

export const SAMPLE: JsonNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Newton & laws' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'F = ma', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' see ' },
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }],
        },
        { type: 'hardBreak' },
        { type: 'text', text: 'बल', marks: [{ type: 'italic' }, { type: 'code' }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            {
              type: 'orderedList',
              attrs: { start: 3 },
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'line 1\nline 2' }] },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: `/api/files/images/${'a'.repeat(32)}.png`, alt: 'diagram' } },
    { type: 'image', attrs: { src: `/api/files/images/${'b'.repeat(32)}.png` } },
  ],
};

describe('docx', () => {
  it('escapes XML and drops characters XML cannot hold', () => {
    expect(xmlText('a<b>&"c"\u0001\u0007')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it('builds a package with the notes, numbering, links and images', async () => {
    const loaded: string[] = [];
    const bytes = await buildDocx(SAMPLE, 'Physics <unit 1>', async (src) => {
      loaded.push(src);
      return src.includes('aaaa') ? { data: PNG_1x1, type: 'png', width: 1200, height: 600 } : null;
    });
    const files = await unzip(bytes);
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/_rels/document.xml.rels',
      'word/media/image1.png',
    ]);
    expect(loaded).toHaveLength(2);
    const doc = new TextDecoder().decode(files.get('word/document.xml'));
    expect(doc).toContain('Physics &lt;unit 1&gt;');
    expect(doc).toContain('<w:pStyle w:val="Heading2"/>');
    expect(doc).toContain('Newton &amp; laws');
    expect(doc).toContain('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">F = ma');
    expect(doc).toContain('<w:br/>');
    expect(doc).toContain('बल');
    expect(doc).toMatch(/<w:ilvl w:val="1"\/><w:numId w:val="3"\/>/); // nested numbered list
    expect(doc).toContain('<w:pStyle w:val="Quote"/>');
    expect(doc.match(/w:val="Code"/g)).toHaveLength(2);
    // The 1200 px image is scaled down to the content width, keeping its aspect ratio.
    expect(doc).toContain('<wp:extent cx="5731510" cy="2865755"/>');
    const rels = new TextDecoder().decode(files.get('word/_rels/document.xml.rels'));
    expect(rels).toContain('Target="https://example.com/?a=1&amp;b=2" TargetMode="External"');
    expect(rels).toContain('Target="media/image1.png"');
    const numbering = new TextDecoder().decode(files.get('word/numbering.xml'));
    expect(numbering).toContain('<w:startOverride w:val="3"/>');
    expect([...(files.get('word/media/image1.png') ?? [])]).toEqual([...PNG_1x1]);
  });
});
