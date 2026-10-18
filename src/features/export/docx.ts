import type { JsonNode } from '../../shared/clean';
import { zipFiles } from '../../shared/zip';

/**
 * Notes (cleaned Tiptap JSON) to a Word document. Hand-written Office Open XML:
 * headings, paragraphs, bold / italic / underline / strike / code, links,
 * bullet and numbered lists (nested), quotes, code blocks, dividers, and images.
 */

export interface DocxImage {
  data: Uint8Array;
  type: 'png' | 'jpeg' | 'gif';
  width: number;
  height: number;
}

/** Fetches an image used in the notes; null skips it. */
export type ImageLoader = (src: string) => Promise<DocxImage | null>;

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const BODY_FONT = 'Noto Sans';
const MONO_FONT = 'Consolas';
/** Content width (A4 minus 2.5 cm margins), in EMU. */
const MAX_IMAGE_EMU = 5_731_510;
const EMU_PER_PX = 9525;

/** XML-escapes text and drops characters XML 1.0 can't hold. */
export function xmlText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- keeps only the characters XML 1.0 allows
      .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

interface Ctx {
  rels: string[];
  media: { name: string; data: Uint8Array }[];
  nums: string[];
  load: ImageLoader;
  images: number;
}

function addRel(ctx: Ctx, type: string, target: string, external = false): string {
  const id = `rId${ctx.rels.length + 10}`;
  ctx.rels.push(
    `<Relationship Id="${id}" Type="${REL}/${type}" Target="${xmlText(target)}"${external ? ' TargetMode="External"' : ''}/>`,
  );
  return id;
}

function runs(ctx: Ctx, nodes: JsonNode[] | undefined): string {
  let out = '';
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out += '<w:r><w:br/></w:r>';
      continue;
    }
    if (node.type !== 'text' || !node.text) continue;
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    const link = node.marks?.find((m) => m.type === 'link')?.attrs?.href;
    let props = '';
    if (link) props += '<w:rStyle w:val="Hyperlink"/>';
    if (marks.has('code'))
      props += `<w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/>`;
    if (marks.has('bold')) props += '<w:b/><w:bCs/>';
    if (marks.has('italic')) props += '<w:i/><w:iCs/>';
    if (marks.has('strike')) props += '<w:strike/>';
    if (marks.has('underline') && !link) props += '<w:u w:val="single"/>';
    if (marks.has('code')) props += '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/>';
    const run = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(node.text)}</w:t></w:r>`;
    out +=
      typeof link === 'string'
        ? `<w:hyperlink r:id="${addRel(ctx, 'hyperlink', link, true)}">${run}</w:hyperlink>`
        : run;
  }
  return out;
}

function paragraph(props: string, body: string): string {
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${body}</w:p>`;
}

async function image(ctx: Ctx, node: JsonNode): Promise<string> {
  const src = node.attrs?.src;
  if (typeof src !== 'string') return '';
  const img = await ctx.load(src).catch(() => null);
  if (!img || img.width <= 0 || img.height <= 0) return '';
  const n = ++ctx.images;
  const name = `image${n}.${img.type === 'jpeg' ? 'jpeg' : img.type}`;
  ctx.media.push({ name, data: img.data });
  const rel = addRel(ctx, 'image', `media/${name}`);
  let cx = img.width * EMU_PER_PX;
  let cy = img.height * EMU_PER_PX;
  if (cx > MAX_IMAGE_EMU) {
    cy = Math.round((cy * MAX_IMAGE_EMU) / cx);
    cx = MAX_IMAGE_EMU;
  }
  const alt = xmlText(typeof node.attrs?.alt === 'string' ? node.attrs.alt : '');
  return paragraph(
    '',
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${n}" name="Image ${n}" descr="${alt}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${n}" name="${name}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
  );
}

interface ListState {
  numId: number;
  level: number;
}

async function blocks(
  ctx: Ctx,
  nodes: JsonNode[] | undefined,
  style = '',
  list?: ListState,
): Promise<string> {
  let out = '';
  for (const node of nodes ?? []) out += await block(ctx, node, style, list);
  return out;
}

async function block(ctx: Ctx, node: JsonNode, style: string, list?: ListState): Promise<string> {
  const styleProp = style ? `<w:pStyle w:val="${style}"/>` : '';
  switch (node.type) {
    case 'paragraph':
      return paragraph(styleProp, runs(ctx, node.content));
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
      return paragraph(`<w:pStyle w:val="Heading${level}"/>`, runs(ctx, node.content));
    }
    case 'blockquote':
      return blocks(ctx, node.content, 'Quote', list);
    case 'codeBlock': {
      const text = (node.content ?? []).map((n) => n.text ?? '').join('');
      return text
        .split('\n')
        .map((line) => paragraph('<w:pStyle w:val="Code"/>', runs(ctx, [{ type: 'text', text: line }])))
        .join('');
    }
    case 'horizontalRule':
      return paragraph(
        '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A8B4"/></w:pBdr>',
        '',
      );
    case 'image':
      return image(ctx, node);
    case 'bulletList':
    case 'orderedList': {
      const level = list ? list.level + 1 : 0;
      let numId: number;
      if (node.type === 'bulletList') numId = 1;
      else {
        // Every numbered list restarts at its own start number.
        numId = ctx.nums.length + 3;
        const start = Math.max(1, Number(node.attrs?.start) || 1);
        ctx.nums.push(
          `<w:num w:numId="${numId}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`,
        );
      }
      let out = '';
      for (const item of node.content ?? []) {
        let first = true;
        for (const child of item.content ?? []) {
          if (child.type === 'paragraph') {
            const num = first
              ? `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`
              : `<w:ind w:left="${720 * (level + 1)}"/>`;
            out += paragraph(`${styleProp}${num}`, runs(ctx, child.content));
            first = false;
          } else out += await block(ctx, child, style, { numId, level });
        }
      }
      return out;
    }
    default:
      return '';
  }
}

function numberingXml(nums: string[]): string {
  const levels = (bullet: boolean) =>
    Array.from({ length: 9 }, (_, i) => {
      const indent = `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>`;
      return bullet
        ? `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][i % 3]}"/><w:lvlJc w:val="left"/>${indent}</w:lvl>`
        : `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/>${indent}</w:lvl>`;
    }).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>${nums.join('')}</w:numbering>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>` +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  [
    [1, 36],
    [2, 30],
    [3, 26],
  ]
    .map(
      ([l, sz]) =>
        `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
        `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${(l as number) - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="0F2A4A"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`,
    )
    .join('') +
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="A0A8B4"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="4A5566"/></w:rPr></w:style>' +
  `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="${MONO_FONT}" w:hAnsi="${MONO_FONT}" w:cs="${MONO_FONT}"/><w:sz w:val="20"/></w:rPr></w:style>` +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F5FAF"/><w:u w:val="single"/></w:rPr></w:style>' +
  '</w:styles>';

export async function buildDocx(
  doc: JsonNode,
  title: string,
  load: ImageLoader,
): Promise<Uint8Array<ArrayBuffer>> {
  const ctx: Ctx = { rels: [], media: [], nums: [], load, images: 0 };
  const titleXml = paragraph('<w:pStyle w:val="Heading1"/>', runs(ctx, [{ type: 'text', text: title }]));
  const body = await blocks(ctx, doc.content);
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${titleXml}${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>` +
    `${ctx.rels.join('')}</Relationships>`;
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${xmlText(title)}</dc:title><dc:creator>AKSHAR</dc:creator></cp:coreProperties>`;

  return zipFiles([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: numberingXml(ctx.nums) },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    ...ctx.media.map((m) => ({ name: `word/media/${m.name}`, data: m.data, compress: false })),
  ]);
}
