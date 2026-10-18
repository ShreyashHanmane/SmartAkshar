import { type FormEvent, useState } from 'react';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { LIMITS, SUBJECT_COLORS, type Subject, type SubjectColor } from '../../data/models';
import { createSubject, updateSubject } from '../../data/subjects';
import { type MessageKey, t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { SUBJECT_CLASSES } from './subjectColors';

const COLOR_LABEL: Record<SubjectColor, MessageKey> = {
  blue: 'subjects.colors.blue',
  purple: 'subjects.colors.purple',
  teal: 'subjects.colors.teal',
  orange: 'subjects.colors.orange',
  green: 'subjects.colors.green',
  rose: 'subjects.colors.rose',
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit this subject; create a new one when omitted. */
  subject?: Subject | undefined;
  existingCount: number;
}

export function SubjectDialog({ open, onClose, subject, existingCount }: Props) {
  const { uid } = useSignedInUser();
  const toast = useToast();
  const fallbackColor = SUBJECT_COLORS[existingCount % SUBJECT_COLORS.length] ?? 'blue';
  const [name, setName] = useState(subject?.name ?? '');
  const [color, setColor] = useState<SubjectColor>(subject?.color ?? fallbackColor);
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('subjects.nameRequired'));
      return;
    }
    // Firestore applies the write locally at once and syncs in the background, so
    // close immediately (works offline too); a server rejection shows an error toast.
    const write = subject ? updateSubject(uid, subject.id, { name, color }) : createSubject(uid, name, color);
    write.catch(() => toast.error(t('subjects.saveFailed')));
    toast.success(subject ? t('subjects.saved') : t('subjects.created'));
    onClose();
  }

  const formId = subject ? `subject-form-${subject.id}` : 'subject-form-new';

  return (
    <Dialog
      open={open}
      title={subject ? t('subjects.editTitle') : t('subjects.newTitle')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId}>
            {subject ? t('common.save') : t('subjects.create')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('subjects.name')}
          value={name}
          maxLength={LIMITS.subjectName}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoFocus
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t('subjects.color')}</legend>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <label
                key={c}
                className="relative inline-flex size-11 cursor-pointer items-center justify-center"
              >
                <input
                  type="radio"
                  name={`${formId}-color`}
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="peer sr-only"
                />
                <span className="sr-only">{t(COLOR_LABEL[c])}</span>
                <span
                  aria-hidden="true"
                  className={`size-7 rounded-full ${SUBJECT_CLASSES[c].dot} ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus`}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
