import { useRef, useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { ApiError } from '../../data/api';
import { importBook } from '../../data/books';
import { BOOK_MAX_BYTES, USER_FILES_MAX_BYTES, checkBook, titleFromFileName } from '../../shared/fileTypes';
import { type MessageKey, t } from '../../i18n/i18n';
import { useToast } from '../../ui/Toast';
import { inspectBook } from '../reader/BookView';

export interface ImportState {
  name: string;
  progress: number;
}

const SERVER_ERRORS: Record<string, MessageKey> = {
  type: 'library.error.type',
  'too-large': 'library.error.size',
  quota: 'library.error.quota',
  network: 'library.error.network',
};

/**
 * Import flow: check the file's real type and size, read its title/author/page
 * count locally, then upload with progress (cancellable). The server checks
 * everything again.
 */
export function useImportBook(usedBytes: number) {
  useSignedInUser();
  const toast = useToast();
  const [state, setState] = useState<ImportState | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function importFile(file: File) {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const check = checkBook(file.name, head, file.size, {
      file: BOOK_MAX_BYTES,
      total: USER_FILES_MAX_BYTES,
      used: usedBytes,
    });
    if (!check.ok) {
      toast.error(
        t(
          check.reason === 'type'
            ? 'library.error.type'
            : check.reason === 'size'
              ? 'library.error.size'
              : 'library.error.quota',
        ),
      );
      return;
    }
    setState({ name: file.name, progress: 0 });
    let meta = { title: titleFromFileName(file.name), author: null as string | null, pageCount: 0 };
    try {
      const info = await inspectBook(check.format, await file.arrayBuffer());
      meta = { title: info.title ?? meta.title, author: info.author, pageCount: info.count };
      if (info.format === 'pdf') info.destroy();
    } catch {
      setState(null);
      toast.error(t('library.error.corrupt'));
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    try {
      await importBook(
        '',
        file,
        { format: check.format, fileName: file.name, ...meta },
        (p) => setState({ name: file.name, progress: p }),
        controller.signal,
      );
      toast.success(t('library.imported', { title: meta.title }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') toast.info(t('library.cancelled'));
      else
        toast.error(t(SERVER_ERRORS[error instanceof ApiError ? error.code : ''] ?? 'library.error.failed'));
    } finally {
      abort.current = null;
      setState(null);
    }
  }

  return { state, importFile, cancel: () => abort.current?.abort() };
}
