import { deflateRawSync } from 'node:zlib';

/** A minimal, valid PDF with one text line per entry on each page (Helvetica). */
export function makePdf(pages: string[][], title = 'Laws of Motion'): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, 4 info, then (page, content) pairs.
  let next = 5;
  const pageObjs: [number, string][] = [];
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const stream = `BT /F1 16 Tf 72 720 Td 20 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    pageObjs.push([
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    pageObjs.push([contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]);
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = `<< /Title (${esc(title)}) /Author (HC Verma) >>`;
  for (const [id, body] of pageObjs) objects[id] = body;
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function makeZip(files: { name: string; data: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.data, 'utf8');
    const body = f.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(f.store ? 0 : 8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(f.store ? 0 : 8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** An EPUB whose first chapter contains hostile content that must be neutralised. */
export function makeEpub(): Buffer {
  const xhtml = (body: string) =>
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>c</title></head><body>${body}</body></html>`;
  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    {
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Brief History of Time</dc:title><dc:creator>Stephen Hawking</dc:creator></metadata>
<manifest><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    },
    {
      name: 'OEBPS/text/ch1.xhtml',
      data: xhtml(
        '<h1>Our Picture of the Universe</h1><p>A well-known scientist once gave a public lecture on astronomy.</p>' +
          '<script>parent.window.__epubPwned = true;</script>' +
          '<img src="https://tracker.example/pixel.png" alt="tracker"/>' +
          '<p style="background:url(https://tracker.example/bg.png)">Styled paragraph.</p>' +
          '<p><a href="https://evil.example/">external link</a></p>' +
          '<p onclick="parent.window.__epubPwned = true">Click me</p>',
      ),
    },
    {
      name: 'OEBPS/text/ch2.xhtml',
      data: xhtml(
        '<h1>Space and Time</h1><p>Our present ideas about the motion of bodies date back to Galileo.</p>',
      ),
    },
  ]);
}

export const PDF_PAGES = [
  [
    "Chapter 4 - Newton's Laws of Motion",
    'The acceleration of an object is inversely',
    'proportional to its mass.',
  ],
  ['Second Law', 'F = ma', 'Force equals mass times acceleration.'],
];

export const TXT =
  'Organic reactions summary\n\nAddition reactions add atoms across a double bond.\n\nSubstitution reactions swap one group for another.';
