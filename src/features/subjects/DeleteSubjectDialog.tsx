import { useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import type { Subject } from '../../data/models';
import { deleteSubject } from '../../data/subjects';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/Toast';

export function DeleteSubjectDialog({ subject, onClose }: { subject: Subject | null; onClose: () => void }) {
  const { uid } = useSignedInUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!subject) return;
    setBusy(true);
    try {
      await deleteSubject(uid, subject.id);
      toast.success(t('subjects.deleted', { name: subject.name }));
      onClose();
    } catch {
      toast.error(t('subjects.deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={subject !== null}
      title={t('subjects.deleteTitle', { name: subject?.name ?? '' })}
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
      {t('subjects.deleteBody')}
    </Dialog>
  );
}
