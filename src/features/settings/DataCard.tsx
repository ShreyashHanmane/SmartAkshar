import { type FormEvent, useId, useState, useSyncExternalStore } from 'react';
import { getSyncSummary, subscribeSyncSummary } from '../../app/save/pending';
import { authErrorCode, deleteAccount } from '../../data/auth';
import { type StorageUse, subscribeStorage } from '../../data/storage';
import { useLive } from '../../data/useLive';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { ProgressBar } from '../../ui/ProgressBar';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useServerReachable } from '../../ui/useOnline';
import { authErrorMessage } from '../auth/errors';
import { ExportAllButton } from './ExportAllButton';
import { promptInstall, useInstallState } from '../../pwa/install';
import { Card, Row } from './SettingsPage';

/** Human-readable size: "0 B", "740 KB", "12.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StorageRow() {
  const storage = useLive<StorageUse>('storage', subscribeStorage);
  let control;
  if (storage.status === 'error') control = <Alert tone="error">{t('settings.storageFailed')}</Alert>;
  else if (storage.status === 'loading')
    control = (
      <div className="h-11 w-56 animate-pulse rounded-lg bg-primary-soft" aria-label={t('common.loading')} />
    );
  else {
    const s = storage.data;
    const percent = Math.min(100, (s.used / s.limit) * 100);
    control = (
      <div className="flex w-full min-w-56 flex-col gap-1.5 sm:w-64">
        <ProgressBar
          max={s.limit}
          value={s.used}
          label={t('settings.storage')}
          valueText={t('settings.storageUsed', {
            used: formatBytes(s.used),
            limit: formatBytes(s.limit),
          })}
        />
        <span className="text-sm text-ink">
          {t('settings.storageUsed', { used: formatBytes(s.used), limit: formatBytes(s.limit) })}
          {percent >= 90 && <span className="text-danger"> · {t('settings.storageAlmostFull')}</span>}
        </span>
        <span className="text-sm text-ink-muted">
          {t('settings.storageBreakdown', {
            books: s.books.count,
            booksSize: formatBytes(s.books.bytes),
            images: s.images.count,
            imagesSize: formatBytes(s.images.bytes),
          })}
        </span>
      </div>
    );
  }
  return <Row title={t('settings.storage')} description={t('settings.storageHint')} control={control} />;
}

function SyncRow() {
  const reachable = useServerReachable();
  const sync = useSyncExternalStore(subscribeSyncSummary, getSyncSummary, getSyncSummary);
  const message = !reachable
    ? t('settings.syncOffline', { count: sync.pending })
    : sync.failed
      ? t('settings.syncRetrying')
      : sync.pending > 0
        ? t('settings.syncSaving', { count: sync.pending })
        : t('settings.syncAllSaved');
  const dot = !reachable || sync.failed ? 'bg-danger' : sync.pending > 0 ? 'bg-accent' : 'bg-success';
  return (
    <Row
      title={t('settings.sync')}
      description={reachable ? t('settings.serverConnected') : t('settings.serverUnreachable')}
      control={
        <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />
          {message}
        </span>
      }
    />
  );
}

function InstallRow() {
  const state = useInstallState();
  return (
    <Row
      title={t('settings.install')}
      description={state === 'unavailable' ? t('settings.installManual') : t('settings.installHint')}
      control={
        state === 'installed' ? (
          <span className="text-sm font-semibold text-ink">{t('settings.installed')}</span>
        ) : state === 'available' ? (
          <Button variant="secondary" icon="download" onClick={() => void promptInstall()}>
            {t('settings.installButton')}
          </Button>
        ) : null
      }
    />
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError(t('settings.currentPasswordRequired'));
      return;
    }
    setBusy(true);
    try {
      await deleteAccount(password);
      window.location.assign('/login');
    } catch (err) {
      const code = authErrorCode(err);
      setError(
        code === 'invalid-credentials'
          ? t('settings.currentPasswordWrong')
          : t(authErrorMessage(code, 'other') ?? 'auth.error.generic'),
      );
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t('settings.deleteAccountTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" type="submit" form={formId} loading={busy}>
            {t('settings.deleteAccountConfirm')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <p>{t('settings.deleteAccountWarning')}</p>
        <TextField
          label={t('settings.currentPassword')}
          type="password"
          autoComplete="current-password"
          value={password}
          error={error}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(undefined);
          }}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

export function DataCard() {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Card title={t('settings.data')}>
        <Row
          title={t('settings.exportAllTitle')}
          description={t('settings.exportAllHint')}
          control={<ExportAllButton />}
        />
        <StorageRow />
        <SyncRow />
        <InstallRow />
      </Card>
      <Card title={t('settings.dangerZone')}>
        <Row
          title={t('settings.deleteAccount')}
          description={t('settings.deleteAccountHint')}
          control={
            <Button variant="danger" icon="trash" onClick={() => setDeleting(true)}>
              {t('settings.deleteAccount')}
            </Button>
          }
        />
      </Card>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}
