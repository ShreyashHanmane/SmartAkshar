import { type FormEvent, useId, useRef, useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import {
  authErrorCode,
  changePassword,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from '../../data/auth';
import { displayNameSchema, passwordSchema } from '../../shared/schemas';
import { NOTE_IMAGE_MAX_BYTES, sniffImage } from '../../shared/images';
import { t, tDynamic } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { authErrorMessage } from '../auth/errors';
import { useSignOut } from '../auth/useSignOut';
import { Card, Row } from './SettingsPage';

const AVATAR_SIDE = 256;

/** Crops the centre square and scales it to a small JPEG, so photos stay tiny and metadata (EXIF, GPS) is dropped. */
async function toAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIDE;
    canvas.height = AVATAR_SIDE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIDE,
      AVATAR_SIDE,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9),
    );
  } finally {
    bitmap.close();
  }
}

export function Avatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-on-primary"
    >
      {initial}
    </span>
  );
}

function PhotoRow() {
  const user = useSignedInUser();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const kind = sniffImage(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
    if (!kind || kind === 'gif') {
      toast.error(t('settings.photoType'));
      return;
    }
    if (file.size > NOTE_IMAGE_MAX_BYTES) {
      toast.error(t('settings.photoSize'));
      return;
    }
    setBusy(true);
    try {
      await uploadAvatar(await toAvatar(file), 'jpg');
      toast.success(t('settings.photoSaved'));
    } catch {
      toast.error(t('settings.photoFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await removeAvatar();
      toast.success(t('settings.photoRemoved'));
    } catch {
      toast.error(t('settings.photoFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 pb-4">
      <Avatar name={user.displayName} url={user.avatarUrl} />
      <Button variant="secondary" icon="upload" loading={busy} onClick={() => fileRef.current?.click()}>
        {t('settings.changePhoto')}
      </Button>
      {user.avatarUrl && (
        <Button variant="secondary" disabled={busy} onClick={() => void onRemove()}>
          {t('settings.removePhoto')}
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('settings.changePhoto')}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function NameFields() {
  const user = useSignedInUser();
  const toast = useToast();
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | undefined>();

  async function save() {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(tDynamic(parsed.error.issues[0]?.message));
      return;
    }
    if (parsed.data === user.displayName) return;
    try {
      await updateDisplayName(parsed.data);
      setName(parsed.data);
      toast.success(t('settings.nameSaved'));
    } catch {
      toast.error(t('settings.saveFailed'));
    }
  }

  return (
    <form
      noValidate
      className="grid gap-4 border-t border-line py-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label={t('auth.name')}
        value={name}
        autoComplete="name"
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          // Two fields and no submit button: browsers don't submit on Enter by themselves.
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
      />
      <TextField
        label={t('auth.username')}
        value={user.username}
        readOnly
        hint={t('settings.usernameHint')}
      />
    </form>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>(
    {},
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!current) found.current = t('settings.currentPasswordRequired');
    const parsed = passwordSchema.safeParse(next);
    if (!parsed.success) found.next = tDynamic(parsed.error.issues[0]?.message) ?? t('auth.error.invalid');
    else if (next !== confirm) found.confirm = t('settings.passwordMismatch');
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success(t('settings.passwordChanged'));
      onClose();
    } catch (error) {
      const code = authErrorCode(error);
      if (code === 'invalid-credentials') setErrors({ current: t('settings.currentPasswordWrong') });
      else setErrors({ form: t(authErrorMessage(code, 'other') ?? 'auth.error.generic') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t('settings.changePassword')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {t('settings.changePassword')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <TextField
          label={t('settings.currentPassword')}
          type="password"
          autoComplete="current-password"
          value={current}
          error={errors.current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus
        />
        <TextField
          label={t('settings.newPassword')}
          type="password"
          autoComplete="new-password"
          value={next}
          hint={t('auth.passwordHint')}
          error={errors.next}
          onChange={(e) => setNext(e.target.value)}
        />
        <TextField
          label={t('settings.confirmPassword')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {errors.form && (
          <p role="alert" className="text-danger">
            {errors.form}
          </p>
        )}
        <p>{t('settings.passwordOtherDevices')}</p>
      </form>
    </Dialog>
  );
}

export function AccountCard() {
  const signOut = useSignOut();
  const [changing, setChanging] = useState(false);
  return (
    <Card title={t('settings.account')}>
      <PhotoRow />
      <NameFields />
      <Row
        title={t('auth.password')}
        control={
          <Button variant="secondary" icon="lock" onClick={() => setChanging(true)}>
            {t('settings.changePassword')}
          </Button>
        }
      />
      <Row
        title={t('auth.signOut')}
        control={
          <Button variant="secondary" loading={signOut.busy} onClick={() => void signOut.start()}>
            {t('auth.signOut')}
          </Button>
        }
      />
      {changing && <PasswordDialog onClose={() => setChanging(false)} />}
      {signOut.dialog}
    </Card>
  );
}
