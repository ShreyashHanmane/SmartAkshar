import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, dataPath, startServer } from './harness.ts';
import { BOOK_MAX_BYTES } from '../../src/shared/fileTypes.ts';

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server.stop());

const client = () => new Client(server.base);
let n = 0;
const uid = (tag: string) => `user_${tag}_${++n}`;

describe('PDF upload and book flow regression tests', () => {
  const VALID_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const BOM_PDF = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), VALID_PDF]);
  const WHITESPACE_PDF = Buffer.concat([Buffer.from('  \r\n\t'), VALID_PDF]);

  it('accepts valid PDF upload authenticated via X-Akshar-User header (Firebase user)', async () => {
    const user = uid('pdf_ok');
    const c = client(); // No session cookie

    const res = await c.raw('POST', '/api/books', {
      body: VALID_PDF,
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'Quantum_Mechanics.pdf',
        'X-Title': 'Quantum Mechanics',
        'X-Author': 'Griffiths',
        'X-Page-Count': '450',
        'Content-Type': 'application/pdf',
      },
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    // Verify stored book metadata
    const listRes = await c.raw('GET', '/api/books', {
      headers: { 'X-Akshar-User': user },
    });
    expect(listRes.status).toBe(200);
    const books = (await listRes.json()) as Array<{ id: string; title: string; author: string; format: string }>;
    const book = books.find((b) => b.id === id);
    expect(book).toBeDefined();
    expect(book?.title).toBe('Quantum Mechanics');
    expect(book?.author).toBe('Griffiths');
    expect(book?.format).toBe('pdf');

    // Verify download by owner
    const downloadRes = await c.raw('GET', `/api/books/${id}/file`, {
      headers: { 'X-Akshar-User': user },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-type')).toBe('application/pdf');
    expect(downloadRes.headers.get('content-disposition')).toBe('attachment');
    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    expect(downloadedBytes.equals(VALID_PDF)).toBe(true);

    // Verify file exists on disk in owner's directory
    const files = readdirSync(dataPath(server.dataDir, 'files', user, 'books'));
    expect(files.some((f) => f.endsWith('.pdf'))).toBe(true);
  });

  it('accepts valid PDF with UTF-8 BOM or leading whitespace', async () => {
    const user = uid('bom_pdf');
    const c = client();

    const bomRes = await c.raw('POST', '/api/books', {
      body: BOM_PDF,
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'bom_doc.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(bomRes.status).toBe(201);

    const wsRes = await c.raw('POST', '/api/books', {
      body: WHITESPACE_PDF,
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'whitespace_doc.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(wsRes.status).toBe(201);
  });

  it('rejects unauthenticated upload attempts (no session cookie and no X-Akshar-User)', async () => {
    const c = client();
    const res = await c.raw('POST', '/api/books', {
      body: VALID_PDF,
      headers: {
        'X-File-Name': 'unauth.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('rejects disguised non-PDF files with a .pdf extension (415 type)', async () => {
    const user = uid('disguised');
    const c = client();

    // HTML disguised as PDF
    const htmlRes = await c.raw('POST', '/api/books', {
      body: Buffer.from('<!DOCTYPE html><html><body>Fake PDF</body></html>'),
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'fake.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(htmlRes.status).toBe(415);
    expect(await htmlRes.json()).toEqual({ error: 'type' });

    // Binary / executable disguised as PDF
    const elfRes = await c.raw('POST', '/api/books', {
      body: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]),
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'exploit.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(elfRes.status).toBe(415);
  });

  it('rejects uploads exceeding the 25 MB book size limit (413 too-large)', async () => {
    const user = uid('too_big');
    const c = client();

    const oversized = Buffer.alloc(BOOK_MAX_BYTES + 1024, 0x20);
    oversized.set(VALID_PDF.subarray(0, 16), 0);

    const res = await c.raw('POST', '/api/books', {
      body: oversized,
      headers: {
        'X-Akshar-User': user,
        'X-File-Name': 'huge.pdf',
        'Content-Type': 'application/pdf',
      },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too-large' });
  });

  it('rejects requests missing the file name header (400 file-name-required)', async () => {
    const user = uid('no_name');
    const c = client();

    const res = await c.raw('POST', '/api/books', {
      body: VALID_PDF,
      headers: {
        'X-Akshar-User': user,
        'Content-Type': 'application/pdf',
      },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'file-name-required' });
  });

  it('safely handles headers with unescaped or malformed URI characters', async () => {
    const user = uid('malformed_uri');
    const c = client();

    const res = await c.raw('POST', '/api/books', {
      body: VALID_PDF,
      headers: {
        'X-Akshar-User': user,
        // %ZZ is an invalid hex sequence for decodeURIComponent
        'X-File-Name': '%ZZ_special_physics.pdf',
        'X-Title': '100% Cotton & Dynamics',
        'X-Author': 'Newton % Co',
        'Content-Type': 'application/pdf',
      },
    });
    expect(res.status).toBe(201);
  });

  it('strictly enforces ownership isolation between users', async () => {
    const alice = uid('alice_owner');
    const bob = uid('bob_attacker');
    const c = client();

    // Alice uploads a PDF
    const uploadRes = await c.raw('POST', '/api/books', {
      body: VALID_PDF,
      headers: {
        'X-Akshar-User': alice,
        'X-File-Name': 'alice_secret.pdf',
        'X-Title': 'Secret Research',
        'Content-Type': 'application/pdf',
      },
    });
    expect(uploadRes.status).toBe(201);
    const { id } = (await uploadRes.json()) as { id: string };

    // Bob attempts to download Alice's PDF
    const bobDownload = await c.raw('GET', `/api/books/${id}/file`, {
      headers: { 'X-Akshar-User': bob },
    });
    expect(bobDownload.status).toBe(404);

    // Bob attempts to highlight Alice's PDF
    const bobHighlight = await c.raw('POST', `/api/books/${id}/highlights`, {
      headers: { 'X-Akshar-User': bob, 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 0, exact: 'text', prefix: '', suffix: '' }),
    });
    expect(bobHighlight.status).toBe(404);

    // Alice can successfully download her own PDF
    const aliceDownload = await c.raw('GET', `/api/books/${id}/file`, {
      headers: { 'X-Akshar-User': alice },
    });
    expect(aliceDownload.status).toBe(200);
  });
});

