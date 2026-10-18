import { type FormEvent, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { PageHeader } from '../../app/shell/PageHeader';
import { type Book, deleteBook, subscribeBooks, updateBookMeta } from '../../data/books';
import { useLive } from '../../data/useLive';
import { type MessageKey, t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useServerReachable } from '../../ui/useOnline';
import { relativeTime } from '../notebooks/time';
import { useImportBook } from './useImportBook';

type Filter = 'all' | Book['format'];
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'library.filter.all' },
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
  { value: 'txt', label: 'TXT' },
];
const BADGE: Record<Book['format'], string> = {
  pdf: 'bg-file-pdf',
  epub: 'bg-file-epub',
  txt: 'bg-file-txt',
};
const UNIT: Record<Book['format'], MessageKey> = {
  pdf: 'library.pages',
  epub: 'library.chapters',
  txt: 'library.parts',
};

function RenameDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(book.title);
  const [error, setError] = useState<string | undefined>();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('notebooks.titleRequired'));
    updateBookMeta('', book.id, { title: title.trim().slice(0, 200) }).catch(() =>
      toast.error(t('library.error.failed')),
    );
    onClose();
  }
  return (
    <Dialog
      open
      title={t('library.renameTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="rename-book">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="rename-book" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('notebooks.title')}
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

function DeleteDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function onDelete() {
    setBusy(true);
    try {
      await deleteBook('', book);
      toast.success(t('library.deleted', { title: book.title }));
      onClose();
    } catch {
      toast.error(t('library.error.failed'));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t('library.deleteTitle', { title: book.title })}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void onDelete()}>
            {t('common.delete')}
          </Button>
        </>
      }
    >
      {t('library.deleteBody')}
    </Dialog>
  );
}

function BookRow({ book, now }: { book: Book; now: number }) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const details = [
    book.author,
    book.pageCount ? t(UNIT[book.format], { count: book.pageCount }) : null,
    book.openedAt ? t('books.opened', { when: relativeTime(book.openedAt, now) }) : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          aria-hidden="true"
          className={`inline-flex size-12 shrink-0 items-end justify-center rounded-lg pb-1.5 text-xs font-bold text-on-primary uppercase ${BADGE[book.format]}`}
        >
          {book.format}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">
            <span className="sr-only">{book.format.toUpperCase()}: </span>
            {book.title}
          </h2>
          <p className="truncate text-sm text-ink-muted">{details.join(' · ')}</p>
          <div
            role="progressbar"
            aria-label={t('library.progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(book.progress * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-track"
          >
            <div
              className="h-full rounded-full bg-progress"
              style={{ width: `${Math.round(book.progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={`/library/${book.id}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-primary-soft"
          aria-label={t('library.readTitle', { title: book.title })}
        >
          {t('library.read')}
        </Link>
        <Link
          to={`/library/${book.id}?notes=1`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:brightness-110"
          aria-label={t('library.readWithNotesTitle', { title: book.title })}
        >
          <Icon name="file" size={18} /> {t('reader.withNotes')}
        </Link>
        <Menu
          label={t('library.actionsFor', { title: book.title })}
          items={[
            { label: t('notebooks.rename'), icon: 'pencil', onSelect: () => setDialog('rename') },
            { label: t('common.delete'), icon: 'trash', danger: true, onSelect: () => setDialog('delete') },
          ]}
        />
      </div>
      {dialog === 'rename' && <RenameDialog book={book} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteDialog book={book} onClose={() => setDialog(null)} />}
    </li>
  );
}

export function LibraryPage() {
  const { uid } = useSignedInUser();
  const online = useServerReachable();
  const books = useLive<Book[]>(uid, (next, fail) => subscribeBooks(uid, next, fail));
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.value === params.get('format'))?.value ?? 'all') as Filter;
  const [now] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const used = books.status === 'ready' ? books.data.reduce((n, b) => n + b.size, 0) : 0;
  const { state: importing, importFile, cancel } = useImportBook(used);
  const shown = useMemo(
    () => (books.status === 'ready' ? books.data.filter((b) => filter === 'all' || b.format === filter) : []),
    [books, filter],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.library')}
        actions={
          <Button
            icon="upload"
            disabled={!online || importing !== null}
            onClick={() => fileRef.current?.click()}
          >
            {t('library.import')}
          </Button>
        }
      >
        <div
          role="tablist"
          aria-label={t('library.filter')}
          className="inline-flex w-fit gap-1 rounded-xl bg-surface-sunken p-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setParams(f.value === 'all' ? {} : { format: f.value }, { replace: true })}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${filter === f.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
            >
              {f.value === 'all' ? t('library.filter.all') : f.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
        aria-label={t('library.import')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      {!online && <Alert tone="offline">{t('common.serverDown')}</Alert>}
      {importing && (
        <div role="status" className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {t('library.uploading', { name: importing.name })}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
              <div
                className="h-full bg-progress transition-all"
                style={{ width: `${Math.round(importing.progress * 100)}%` }}
              />
            </div>
          </div>
          <Button variant="secondary" onClick={cancel}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {books.status === 'loading' && (
        <ul aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-surface-sunken motion-reduce:animate-none"
            />
          ))}
        </ul>
      )}
      {books.status === 'error' && <Alert tone="error">{t('dashboard.booksFailed')}</Alert>}
      {books.status === 'ready' && books.data.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="text-base text-ink">{t('library.empty')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('library.emptyHint')}</p>
        </div>
      )}
      {books.status === 'ready' && books.data.length > 0 && shown.length === 0 && (
        <p className="text-ink-muted">{t('library.emptyFilter')}</p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-3">
          {shown.map((b) => (
            <BookRow key={b.id} book={b} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
