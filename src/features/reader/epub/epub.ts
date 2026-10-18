import DOMPurify from 'dompurify';
import { IMAGE_MIME, sniffImage } from '../../../shared/images';
import { ZipArchive, ZipError, resolveHref } from './zip';

export interface EpubChapter {
  /** Path inside the archive. */
  path: string;
}

export interface EpubBook {
  title: string | null;
  author: string | null;
  chapters: EpubChapter[];
  zip: ZipArchive;
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new ZipError('Invalid XML');
  return doc;
}

/** Local-name lookup that ignores XML namespaces (dc:title, opf:item...). */
function all(root: ParentNode, name: string): globalThis.Element[] {
  return [...root.querySelectorAll('*')].filter((el) => el.localName === name);
}

export async function openEpub(bytes: Uint8Array): Promise<EpubBook> {
  const zip = new ZipArchive(bytes);
  const container = parseXml(await zip.text('META-INF/container.xml'));
  const opfPath = all(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new ZipError('No package file');
  const opf = parseXml(await zip.text(opfPath));
  const text = (name: string) => all(opf, name)[0]?.textContent?.trim().slice(0, 200) || null;

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of all(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { href, type: item.getAttribute('media-type') ?? '' });
  }
  const chapters: EpubChapter[] = [];
  for (const ref of all(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || !/x?html/.test(item.type)) continue;
    const path = resolveHref(opfPath, item.href);
    if (zip.has(path)) chapters.push({ path });
  }
  if (chapters.length === 0) throw new ZipError('No readable chapters');
  return { title: text('title'), author: text('creator'), chapters, zip };
}

export interface RenderedChapter {
  html: string;
  /** Blob URLs for images; revoke when the chapter is closed. */
  urls: string[];
}

const FORBID_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'svg',
  'math',
  'video',
  'audio',
  'source',
  'track',
];
// Inline style can load remote resources (url()), so it is dropped along with event handlers.
const FORBID_ATTR = ['style', 'srcset', 'background', 'poster', 'formaction', 'xlink:href'];

/**
 * Sanitises one chapter for display in a sandboxed iframe: no scripts, no forms,
 * no remote resources. Images come only from inside the EPUB (as blob URLs, after
 * a content check); external links are kept as plain text.
 */
export async function renderChapter(book: EpubBook, index: number): Promise<RenderedChapter> {
  const chapter = book.chapters[index];
  if (!chapter) throw new ZipError('No such chapter');
  const source = await book.zip.text(chapter.path);
  let doc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(source, 'text/html');
  const body = doc.body ?? doc.documentElement;

  const urls: string[] = [];
  for (const img of [...body.querySelectorAll('img, image')]) {
    const src = img.getAttribute('src') ?? img.getAttribute('href') ?? img.getAttribute('xlink:href') ?? '';
    let url: string | null = null;
    if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      try {
        const path = resolveHref(chapter.path, src);
        if (book.zip.has(path)) {
          const bytes = await book.zip.read(path);
          const kind = sniffImage(bytes);
          if (kind) {
            url = URL.createObjectURL(new Blob([bytes.slice()], { type: IMAGE_MIME[kind] }));
            urls.push(url);
          }
        }
      } catch {
        url = null;
      }
    }
    if (url && img.localName === 'img') img.setAttribute('src', url);
    else img.remove();
  }

  const hook = (node: globalThis.Element) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      // Internal jumps (#id) are kept; everything else becomes plain text.
      if (!href.startsWith('#')) node.removeAttribute('href');
      node.removeAttribute('target');
    }
    if (node.tagName === 'IMG' && !(node.getAttribute('src') ?? '').startsWith('blob:')) node.remove();
  };
  DOMPurify.addHook('afterSanitizeAttributes', hook);
  try {
    const html = DOMPurify.sanitize(body.innerHTML, {
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOWED_URI_REGEXP: /^(?:blob:|#)/i,
    });
    return { html, urls };
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
