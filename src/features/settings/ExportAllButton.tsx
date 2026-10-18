import { useEffect, useRef, useState } from 'react';
import { downloadAllData } from '../../data/exportAll';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { saveFile } from '../export/exporters';

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/** "Export all my data": a ZIP with data.json and every uploaded file, with progress and cancel. */
export function ExportAllButton() {
  const toast = useToast();
  const [received, setReceived] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function start() {
    const controller = new AbortController();
    abort.current = controller;
    setReceived(0);
    try {
      const { blob, name } = await downloadAllData(setReceived, controller.signal);
      saveFile(blob, name);
      toast.success(t('export.saved', { name }));
    } catch {
      if (!controller.signal.aborted) toast.error(t('export.failed'));
    } finally {
      abort.current = null;
      setReceived(null);
    }
  }

  if (received === null)
    return (
      <Button variant="secondary" icon="download" onClick={() => void start()}>
        {t('settings.exportAll')}
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span role="status" className="text-sm text-ink-muted">
        {t('settings.exportAllProgress', { mb: mb(received) })}
      </span>
      <Button variant="secondary" onClick={() => abort.current?.abort()}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
