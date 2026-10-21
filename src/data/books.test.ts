import { describe, expect, it, vi } from 'vitest';
import { importBook } from './books';
import { ApiError } from './api';

describe('importBook client data layer', () => {
  it('sends X-Akshar-User header and metadata via XHR and resolves on 201', async () => {
    const headersSent: Record<string, string> = {};
    let urlSent = '';
    let methodSent = '';
    let withCredentialsSent = false;
    let bodySent: unknown = null;

    class MockXHR {
      upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
      status = 201;
      responseText = JSON.stringify({ id: 'book-123' });
      withCredentials = false;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open(method: string, url: string) {
        methodSent = method;
        urlSent = url;
      }
      setRequestHeader(key: string, value: string) {
        headersSent[key] = value;
      }
      send(body?: unknown) {
        bodySent = body;
        withCredentialsSent = this.withCredentials;
        if (this.upload.onprogress) {
          this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
        }
        setTimeout(() => this.onload?.(), 0);
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXHR);

    const progressValues: number[] = [];
    const blob = new Blob(['%PDF-1.7\n'], { type: 'application/pdf' });
    const bookId = await importBook(
      'user_123',
      blob,
      {
        format: 'pdf',
        fileName: 'mechanics.pdf',
        title: 'Classical Mechanics',
        author: 'Goldstein',
        pageCount: 500,
      },
      (p) => progressValues.push(p),
    );

    expect(bookId).toBe('book-123');
    expect(methodSent).toBe('POST');
    expect(urlSent).toBe('/api/books');
    expect(withCredentialsSent).toBe(true);
    expect(headersSent['X-Akshar']).toBe('1');
    expect(headersSent['X-Akshar-User']).toBe('user_123');
    expect(headersSent['Content-Type']).toBe('application/pdf');
    expect(headersSent['X-File-Name']).toBe(encodeURIComponent('mechanics.pdf'));
    expect(headersSent['X-Title']).toBe(encodeURIComponent('Classical Mechanics'));
    expect(headersSent['X-Author']).toBe(encodeURIComponent('Goldstein'));
    expect(headersSent['X-Page-Count']).toBe('500');
    expect(progressValues).toEqual([0.5]);
    expect(bodySent).toBe(blob);

    vi.unstubAllGlobals();
  });

  it('rejects with ApiError on non-201 response status', async () => {
    class FailingXHR {
      upload = { onprogress: null };
      status = 415;
      responseText = JSON.stringify({ error: 'type' });
      onload: (() => void) | null = null;

      open() {}
      setRequestHeader() {}
      send() {
        setTimeout(() => this.onload?.(), 0);
      }
    }

    vi.stubGlobal('XMLHttpRequest', FailingXHR);

    const blob = new Blob(['fake'], { type: 'application/pdf' });
    await expect(
      importBook('user_123', blob, { format: 'pdf', fileName: 'f.pdf', title: 'F', author: null, pageCount: 1 }, () => {}),
    ).rejects.toThrow(ApiError);

    vi.unstubAllGlobals();
  });
});

