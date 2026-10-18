import { useRef, useState } from 'react';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { useToast } from '../../ui/Toast';
import { type Progress, saveFile } from './exporters';

export interface ExportResult {
  blob: Blob;
  name: string;
}

class Cancelled extends Error {}

/**
 * Export with an optional choice (e.g. this page / all pages), a progress bar,
 * and cancel. The file is saved through the browser's normal download.
 */
export function ExportDialog<T extends string>({
  title,
  description,
  choices,
  run,
  onClose,
}: {
  title: string;
  description?: string;
  choices?: { label: string; options: { value: T; label: string }[] };
  run: (choice: T | undefined, progress: Progress) => Promise<ExportResult>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [choice, setChoice] = useState<T | undefined>(choices?.options[0]?.value);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  async function start() {
    cancelled.current = false;
    setFailed(false);
    setProgress({ done: 0, total: 1 });
    try {
      const result = await run(choice, (done, total) => {
        if (cancelled.current) throw new Cancelled();
        setProgress({ done, total });
      });
      if (cancelled.current) return;
      saveFile(result.blob, result.name);
      toast.success(t('export.saved', { name: result.name }));
      onClose();
    } catch (error) {
      if (error instanceof Cancelled || cancelled.current) return;
      setFailed(true);
      setProgress(null);
    }
  }

  function cancel() {
    if (progress) {
      cancelled.current = true;
      setProgress(null);
    }
    onClose();
  }

  const running = progress !== null;
  return (
    <Dialog
      open
      title={title}
      onClose={cancel}
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void start()} disabled={running}>
            {running ? t('export.working') : t('export.export')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {description && <p>{description}</p>}
        {choices && (
          <Segmented
            label={choices.label}
            value={choice ?? (choices.options[0]?.value as T)}
            options={choices.options}
            onChange={(v) => !running && setChoice(v)}
          />
        )}
        {running && (
          <div className="flex flex-col gap-2" role="status">
            <progress
              className="h-2 w-full accent-primary"
              max={progress.total}
              value={progress.done}
              aria-label={t('export.progress')}
            />
            <span>
              {progress.total > 1
                ? t('export.pageOf', {
                    done: Math.min(progress.done + 1, progress.total),
                    total: progress.total,
                  })
                : t('export.working')}
            </span>
          </div>
        )}
        {failed && (
          <p role="alert" className="text-danger">
            {t('export.failed')}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** One-click exports (PNG, DOCX, CSV): a toast while preparing, then the download. */
export function useQuickExport() {
  const toast = useToast();
  const busy = useRef(false);
  return async (task: () => Promise<ExportResult>) => {
    if (busy.current) return;
    busy.current = true;
    toast.info(t('export.preparing'));
    try {
      const result = await task();
      saveFile(result.blob, result.name);
      toast.success(t('export.saved', { name: result.name }));
    } catch {
      toast.error(t('export.failed'));
    } finally {
      busy.current = false;
    }
  };
}
