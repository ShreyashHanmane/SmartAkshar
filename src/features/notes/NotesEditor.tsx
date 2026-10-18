import Image from '@tiptap/extension-image';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { type FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DocSaver } from '../../app/save/DocSaver';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { useStudyTracker } from '../../app/study/useStudyTracker';
import {
  type NoteContent,
  allowedImageOrigins,
  saveNote,
  subscribeNote,
  uploadNoteImage,
} from '../../data/notes';
import { NOTE_IMAGE_MAX_BYTES, checkImage } from '../../data/uploads';
import { type MessageKey, t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Icon, type IconName } from '../../ui/Icon';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useOnline } from '../../ui/useOnline';
import { PAGE_BYTES_LIMIT, type SaveStatus, saveStatus } from '../whiteboard/saveState';
import { cleanContent, isOwnImage, isSafeHref } from './clean';

/** Sanitises pasted HTML before ProseMirror parses it: no scripts, no unsafe links, no foreign images. */
function sanitizePaste(html: string, uid: string, origins: string[]): string {
  const hook = (node: globalThis.Element) => {
    if (node.tagName === 'IMG' && !isOwnImage(node.getAttribute('src'), uid, origins)) node.remove();
    if (node.tagName === 'A' && !isSafeHref(node.getAttribute('href'))) node.removeAttribute('href');
  };
  DOMPurify.addHook('afterSanitizeAttributes', hook);
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'svg', 'math'],
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

interface ToolProps {
  icon?: IconName;
  text?: string;
  label: MessageKey;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function Tool({ icon, text, label, active = false, disabled = false, onClick }: ToolProps) {
  return (
    <button
      type="button"
      aria-label={t(label)}
      title={t(label)}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold disabled:opacity-35 ${active ? 'bg-primary-soft text-accent-on-soft' : 'text-ink hover:bg-primary-soft'}`}
    >
      {icon ? <Icon name={icon} filled={active} /> : text}
    </button>
  );
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('link').href as string | undefined;
  const [value, setValue] = useState(current ?? '');
  const [error, setError] = useState<string | undefined>();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (!isSafeHref(href)) {
      setError(t('notes.linkInvalid'));
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  }

  return (
    <Dialog
      open
      title={t('notes.linkTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="link-form">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="link-form" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('notes.linkUrl')}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          error={error}
          hint={t('notes.linkHint')}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

/** Typed notes for a notebook (Tiptap). Returns its save status for the top bar. */
export function NotesEditor({
  notebookId,
  onStatus,
}: {
  notebookId: string;
  onStatus: (s: SaveStatus, retry: () => void) => void;
}) {
  const user = useSignedInUser();
  const toast = useToast();
  const online = useOnline();
  const origins = useMemo(() => allowedImageOrigins(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loaded = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [tooLarge, setTooLarge] = useState(false);
  useStudyTracker();

  const [saver] = useState(
    () =>
      new DocSaver<NoteContent>({
        save: (content) => saveNote(user.uid, notebookId, content),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (id) => window.clearTimeout(id),
      }),
  );
  const saverState = useSyncExternalStore(saver.subscribe, saver.getState);
  const status = saveStatus({
    dirty: saverState.dirty ? 1 : 0,
    inFlight: saverState.inFlight,
    failed: saverState.failed || tooLarge,
    online,
  });

  useEffect(() => onStatus(status, () => saver.retry()), [status, saver, onStatus]);

  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: [],
          isAllowedUri: (url) => isSafeHref(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Image.configure({ allowBase64: false, inline: false }),
    ],
    editorProps: {
      attributes: {
        class: 'notes-prose',
        'aria-label': t('notes.editor'),
        role: 'textbox',
        'aria-multiline': 'true',
      },
      transformPastedHTML: (html) => sanitizePaste(html, user.uid, origins),
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        for (const f of files) void insertImage(f);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        for (const f of files) void insertImage(f);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const content = cleanContent(e.getJSON(), user.uid, origins) as unknown as NoteContent;
      const big = new TextEncoder().encode(JSON.stringify(content)).length > PAGE_BYTES_LIMIT;
      setTooLarge(big);
      if (!big) saver.update(content);
    },
  });

  // Load and live-update. Remote changes apply only when there are no local unsaved edits.
  useEffect(() => {
    if (!editor) return;
    return subscribeNote(
      user.uid,
      notebookId,
      (content) => {
        const s = saver.getState();
        if (loaded.current && (s.dirty || s.inFlight > 0 || editor.isFocused)) return;
        const clean = cleanContent(content ?? { type: 'doc' }, user.uid, origins);
        if (JSON.stringify(clean) !== JSON.stringify(editor.getJSON()))
          editor.commands.setContent(clean, { emitUpdate: false });
        loaded.current = true;
        setLoadState('ready');
      },
      () => setLoadState('error'),
    );
  }, [editor, user.uid, notebookId, origins, saver]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Save pending edits when leaving.
  useEffect(() => () => saver.flush(), [saver]);

  async function insertImage(file: File) {
    // Read through a ref: paste/drop handlers were created before the editor existed.
    const editor = editorRef.current;
    if (!editor) return;
    if (!navigator.onLine) {
      toast.error(t('notes.imageOffline'));
      return;
    }
    const max = user.isGuest ? NOTE_IMAGE_MAX_BYTES.guest : NOTE_IMAGE_MAX_BYTES.account;
    const check = checkImage(file.name || 'pasted.png', await readHead(file), file.size, max);
    if (!check.ok) {
      toast.error(
        check.reason === 'type'
          ? t('notes.imageType')
          : t('notes.imageSize', { mb: Math.round(max / 1024 / 1024) }),
      );
      return;
    }
    setUploading((n) => n + 1);
    try {
      const src = await uploadNoteImage(user.uid, notebookId, file, check.kind);
      const alt = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 120) || t('notes.imageAlt');
      editor.chain().focus().setImage({ src, alt }).run();
    } catch {
      toast.error(t('notes.imageFailed'));
    } finally {
      setUploading((n) => n - 1);
    }
  }

  if (loadState === 'error') return <Alert tone="error">{t('notes.loadFailed')}</Alert>;
  const e = editor;

  return (
    <div className="flex h-full flex-col">
      <div
        role="toolbar"
        aria-label={t('notes.toolbar')}
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-2 py-1 sm:flex-wrap"
      >
        <Tool
          icon="undo"
          label="whiteboard.undo"
          disabled={!e?.can().undo()}
          onClick={() => e?.chain().focus().undo().run()}
        />
        <Tool
          icon="redo"
          label="whiteboard.redo"
          disabled={!e?.can().redo()}
          onClick={() => e?.chain().focus().redo().run()}
        />
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        {([1, 2, 3] as const).map((level) => (
          <Tool
            key={level}
            text={`H${level}`}
            label={`notes.heading${level}`}
            active={e?.isActive('heading', { level }) ?? false}
            onClick={() => e?.chain().focus().toggleHeading({ level }).run()}
          />
        ))}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <Tool
          text="B"
          label="notes.bold"
          active={e?.isActive('bold') ?? false}
          onClick={() => e?.chain().focus().toggleBold().run()}
        />
        <Tool
          text="I"
          label="notes.italic"
          active={e?.isActive('italic') ?? false}
          onClick={() => e?.chain().focus().toggleItalic().run()}
        />
        <Tool
          text="U"
          label="notes.underline"
          active={e?.isActive('underline') ?? false}
          onClick={() => e?.chain().focus().toggleUnderline().run()}
        />
        <Tool
          text="S"
          label="notes.strike"
          active={e?.isActive('strike') ?? false}
          onClick={() => e?.chain().focus().toggleStrike().run()}
        />
        <Tool
          text="</>"
          label="notes.code"
          active={e?.isActive('code') ?? false}
          onClick={() => e?.chain().focus().toggleCode().run()}
        />
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <Tool
          text="•"
          label="notes.bulletList"
          active={e?.isActive('bulletList') ?? false}
          onClick={() => e?.chain().focus().toggleBulletList().run()}
        />
        <Tool
          text="1."
          label="notes.orderedList"
          active={e?.isActive('orderedList') ?? false}
          onClick={() => e?.chain().focus().toggleOrderedList().run()}
        />
        <Tool
          text="❝"
          label="notes.quote"
          active={e?.isActive('blockquote') ?? false}
          onClick={() => e?.chain().focus().toggleBlockquote().run()}
        />
        <Tool
          text="{ }"
          label="notes.codeBlock"
          active={e?.isActive('codeBlock') ?? false}
          onClick={() => e?.chain().focus().toggleCodeBlock().run()}
        />
        <Tool
          icon="minus"
          label="notes.divider"
          onClick={() => e?.chain().focus().setHorizontalRule().run()}
        />
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <Tool
          icon="arrowRight"
          label="notes.link"
          active={e?.isActive('link') ?? false}
          onClick={() => setLinking(true)}
        />
        <Tool
          icon="upload"
          label="notes.image"
          disabled={uploading > 0}
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (file) void insertImage(file);
          }}
        />
        {uploading > 0 && (
          <span role="status" className="ml-2 text-sm text-ink-muted">
            {t('notes.uploading')}
          </span>
        )}
      </div>
      {tooLarge && (
        <div className="px-4 pt-3">
          <Alert tone="error">{t('notes.tooLarge')}</Alert>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface px-6 py-8 sm:px-10">
          {loadState === 'loading' && (
            <div aria-hidden="true" className="flex flex-col gap-3">
              <div className="h-8 w-1/2 animate-pulse rounded bg-surface-sunken" />
              <div className="h-4 animate-pulse rounded bg-surface-sunken" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-surface-sunken" />
            </div>
          )}
          <div className={loadState === 'loading' ? 'hidden' : ''}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {linking && e && <LinkDialog editor={e} onClose={() => setLinking(false)} />}
    </div>
  );
}
