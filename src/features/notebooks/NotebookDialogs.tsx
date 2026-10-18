import { type FormEvent, useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { LIMITS } from '../../data/models';
import { type Notebook, deleteNotebook, renameNotebook } from '../../data/notebooks';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';

export function RenameNotebookDialog({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const { uid } = useSignedInUser();
  const toast = useToast();
  const [title, setTitle] = useState(notebook.title);
  const [error, setError] = useState<string | undefined>();
  const formId = `rename-${notebook.id}`;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t('notebooks.titleRequired'));
      return;
    }
    renameNotebook(uid, notebook.id, title).catch(() => toast.error(t('notebooks.saveFailed')));
    toast.success(t('notebooks.renamed'));
    onClose();
  }

  return (
    <Dialog
      open
      title={t('notebooks.renameTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit}>
        <TextField
          label={t('notebooks.title')}
          value={title}
          maxLength={LIMITS.title}
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

export function DeleteNotebookDialog({
  notebook,
  onClose,
  onDeleted,
}: {
  notebook: Notebook;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { uid } = useSignedInUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      await deleteNotebook(uid, notebook.id);
      toast.success(t('notebooks.deleted', { title: notebook.title }));
      onClose();
      onDeleted?.();
    } catch {
      toast.error(t('notebooks.deleteFailed'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t('notebooks.deleteTitle', { title: notebook.title })}
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
      {t('notebooks.deleteBody')}
    </Dialog>
  );
}
