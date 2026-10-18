import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../app/shell/PageHeader';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { SUBJECT_CLASSES } from '../subjects/subjectColors';
import { useSubjects } from '../subjects/SubjectsProvider';
import { CreateNotebookCard, NotebookCard, NotebookGridSkeleton } from './NotebookCard';
import { useNotebooks } from './NotebooksProvider';
import { useNewNotebook } from './NewNotebookProvider';

/** All notebooks, filterable by subject (?subject=id from the sidebar). */
export function NotebooksPage() {
  const notebooks = useNotebooks();
  const subjects = useSubjects();
  const openNew = useNewNotebook();
  const [params] = useSearchParams();
  const [now] = useState(() => Date.now());
  const subjectList = subjects.status === 'ready' ? subjects.data : [];
  const requested = params.get('subject');
  // Only accept ids of the user's own subjects (URL input is untrusted).
  const filter = subjectList.some((s) => s.id === requested) ? requested : null;
  const shown =
    notebooks.status === 'ready' ? notebooks.data.filter((n) => !filter || n.subjectId === filter) : [];

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${active ? 'border-primary bg-primary-soft text-accent-on-soft' : 'border-line bg-surface text-ink-muted hover:text-ink'}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('notebooks.pageTitle')}
        actions={
          <Button icon="plus" onClick={() => openNew(filter)}>
            {t('notebooks.new')}
          </Button>
        }
      >
        {subjectList.length > 0 && (
          <nav aria-label={t('notebooks.filter')} className="flex flex-wrap gap-2">
            <Link to="/notebooks" className={chip(!filter)} aria-current={!filter ? 'page' : undefined}>
              {t('notebooks.all')}
            </Link>
            {subjectList.map((s) => (
              <Link
                key={s.id}
                to={`/notebooks?subject=${encodeURIComponent(s.id)}`}
                className={chip(filter === s.id)}
                aria-current={filter === s.id ? 'page' : undefined}
              >
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${SUBJECT_CLASSES[s.color].dot}`}
                />
                {s.name}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {notebooks.status === 'loading' && <NotebookGridSkeleton count={6} />}
      {notebooks.status === 'error' && <Alert tone="error">{t('notebooks.loadFailed')}</Alert>}
      {notebooks.status === 'ready' && (
        <>
          {shown.length === 0 && (
            <p className="text-ink-muted">
              {filter ? t('notebooks.emptySubject') : t('dashboard.noNotebooks')}
            </p>
          )}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {shown.map((n) => (
              <li key={n.id}>
                <NotebookCard notebook={n} now={now} />
              </li>
            ))}
            <li>
              <CreateNotebookCard onCreate={() => openNew(filter)} />
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
