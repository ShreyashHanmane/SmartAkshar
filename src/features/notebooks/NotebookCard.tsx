import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notebook } from '../../data/notebooks';
import { t } from '../../i18n/i18n';
import { Menu } from '../../ui/Menu';
import { SUBJECT_CLASSES } from '../subjects/subjectColors';
import { useSubject } from '../subjects/SubjectsProvider';
import { DeleteNotebookDialog, RenameNotebookDialog } from './NotebookDialogs';
import { NotebookThumbnail } from './NotebookThumbnail';
import { relativeTime } from './time';

export function NotebookCard({ notebook, now }: { notebook: Notebook; now: number }) {
  const subject = useSubject(notebook.subjectId);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const edited = notebook.updatedAt ? relativeTime(notebook.updatedAt, now) : t('notebooks.justNow');

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-line-strong">
      <NotebookThumbnail notebook={notebook} color={subject?.color ?? null} />
      <div className="flex items-start gap-2 border-t border-line p-4">
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-xs font-bold tracking-[0.06em] uppercase ${subject ? SUBJECT_CLASSES[subject.color].text : 'text-ink-muted'}`}
          >
            {subject?.name ?? t('notebooks.noSubject')}
          </p>
          <h3 className="truncate text-base font-semibold text-ink">
            <Link
              to={`/notebooks/${notebook.id}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {notebook.title}
            </Link>
          </h3>
          <p className="text-sm text-ink-muted">{t('notebooks.edited', { when: edited })}</p>
        </div>
        <div className="relative z-10 -mr-2">
          <Menu
            label={t('notebooks.actionsFor', { title: notebook.title })}
            items={[
              { label: t('notebooks.rename'), icon: 'pencil', onSelect: () => setDialog('rename') },
              { label: t('common.delete'), icon: 'trash', danger: true, onSelect: () => setDialog('delete') },
            ]}
          />
        </div>
      </div>
      {dialog === 'rename' && <RenameNotebookDialog notebook={notebook} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <DeleteNotebookDialog notebook={notebook} onClose={() => setDialog(null)} />}
    </article>
  );
}

export function CreateNotebookCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-canvas p-6 text-center text-ink hover:bg-primary-soft"
    >
      <span className="text-3xl leading-none" aria-hidden="true">
        +
      </span>
      <span className="text-base font-semibold">{t('notebooks.createCard')}</span>
      <span className="text-sm text-ink-muted">{t('notebooks.createCardHint')}</span>
    </button>
  );
}

export function NotebookGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-60 animate-pulse rounded-2xl bg-surface-sunken motion-reduce:animate-none" />
      ))}
    </ul>
  );
}
