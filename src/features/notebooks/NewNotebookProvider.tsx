import {
  type FormEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { LIMITS } from '../../data/models';
import { createNotebook } from '../../data/notebooks';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useSubjects } from '../subjects/SubjectsProvider';

const OpenContext = createContext<(subjectId?: string | null) => void>(() => undefined);

/** "New notebook" asks only for a title and a subject (CLAUDE.md §5). */
function NewNotebookDialog({
  initialSubject,
  onClose,
}: {
  initialSubject: string | null;
  onClose: () => void;
}) {
  const { uid } = useSignedInUser();
  const subjects = useSubjects();
  const toast = useToast();
  const navigate = useNavigate();
  const selectId = useId();
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<string>(initialSubject ?? '');
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t('notebooks.titleRequired'));
      return;
    }
    const { id, done } = createNotebook(uid, { title, subjectId: subjectId || null });
    done.catch(() => toast.error(t('notebooks.createFailed')));
    onClose();
    navigate(`/notebooks/${id}`);
  }

  return (
    <Dialog
      open
      title={t('notebooks.new')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-notebook-form">
            {t('notebooks.create')}
          </Button>
        </>
      }
    >
      <form id="new-notebook-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-sm font-semibold text-ink">
            {t('notebooks.subject')}
          </label>
          <select
            id={selectId}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
          >
            <option value="">{t('notebooks.noSubject')}</option>
            {subjects.status === 'ready' &&
              subjects.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </form>
    </Dialog>
  );
}

export function NewNotebookProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; subject: string | null; key: number }>({
    open: false,
    subject: null,
    key: 0,
  });
  const open = useCallback(
    (subjectId?: string | null) =>
      setState((s) => ({ open: true, subject: subjectId ?? null, key: s.key + 1 })),
    [],
  );
  return (
    <OpenContext.Provider value={open}>
      {children}
      {state.open && (
        <NewNotebookDialog
          key={state.key}
          initialSubject={state.subject}
          onClose={() => setState((s) => ({ ...s, open: false }))}
        />
      )}
    </OpenContext.Provider>
  );
}

export function useNewNotebook() {
  return useContext(OpenContext);
}
