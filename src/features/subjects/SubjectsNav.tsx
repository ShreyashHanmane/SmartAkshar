import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { Subject } from '../../data/models';
import { t } from '../../i18n/i18n';
import { IconButton } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { DeleteSubjectDialog } from './DeleteSubjectDialog';
import { SubjectDialog } from './SubjectDialog';
import { SUBJECT_CLASSES } from './subjectColors';
import { useSubjects } from './SubjectsProvider';

/** Sidebar "SUBJECTS" section: list, filter link, create, rename/recolor, delete. */
export function SubjectsNav({
  counts,
  onNavigate,
}: {
  counts?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const subjects = useSubjects();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const count = subjects.status === 'ready' ? subjects.data.length : 0;

  return (
    <section aria-labelledby="subjects-heading" className="flex flex-col gap-1">
      <div className="flex items-center justify-between pr-1 pl-3">
        <h2 id="subjects-heading" className="text-xs font-bold tracking-[0.08em] text-ink-muted uppercase">
          {t('subjects.heading')}
        </h2>
        <IconButton
          icon="plus"
          label={t('subjects.add')}
          onClick={() => setCreating(true)}
          className="size-9"
        />
      </div>

      {subjects.status === 'loading' && (
        <ul aria-hidden="true" className="flex flex-col gap-2 px-3 py-1">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-6 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none" />
          ))}
        </ul>
      )}
      {subjects.status === 'error' && <p className="px-3 text-sm text-danger">{t('subjects.loadFailed')}</p>}
      {subjects.status === 'ready' && subjects.data.length === 0 && (
        <p className="px-3 text-sm text-ink-muted">{t('subjects.empty')}</p>
      )}
      {subjects.status === 'ready' && subjects.data.length > 0 && (
        <ul className="flex flex-col">
          {subjects.data.map((subject) => (
            <li key={subject.id} className="group flex items-center">
              <NavLink
                to={`/notebooks?subject=${encodeURIComponent(subject.id)}`}
                onClick={onNavigate}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-sm text-ink hover:bg-primary-soft"
              >
                <span
                  aria-hidden="true"
                  className={`size-3 shrink-0 rounded-full ${SUBJECT_CLASSES[subject.color].dot}`}
                />
                <span className="truncate">{subject.name}</span>
                {counts?.[subject.id] ? (
                  <span className="ml-auto text-xs text-ink-muted">{counts[subject.id]}</span>
                ) : null}
              </NavLink>
              <Menu
                label={t('subjects.actionsFor', { name: subject.name })}
                triggerClassName="size-9"
                items={[
                  { label: t('subjects.edit'), icon: 'pencil', onSelect: () => setEditing(subject) },
                  {
                    label: t('common.delete'),
                    icon: 'trash',
                    danger: true,
                    onSelect: () => setDeleting(subject),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {creating && <SubjectDialog open onClose={() => setCreating(false)} existingCount={count} />}
      {editing && (
        <SubjectDialog open subject={editing} onClose={() => setEditing(null)} existingCount={count} />
      )}
      <DeleteSubjectDialog subject={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
