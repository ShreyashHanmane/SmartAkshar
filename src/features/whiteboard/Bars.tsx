import { Link } from 'react-router-dom';
import type { Subject } from '../../data/models';
import { type MessageKey, t } from '../../i18n/i18n';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Segmented } from '../../ui/Segmented';
import { Spinner } from '../../ui/Spinner';
import { SUBJECT_CLASSES } from '../subjects/subjectColors';
import type { SaveStatus } from './saveState';

const SAVE_LABEL: Record<Exclude<SaveStatus, 'error'>, MessageKey> = {
  saving: 'whiteboard.save.saving',
  saved: 'whiteboard.save.saved',
  offline: 'whiteboard.save.offline',
};

export function SavedChip({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const base = 'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold';
  if (status === 'error')
    return (
      <span role="alert" className={`${base} border border-danger bg-surface text-danger`}>
        <Icon name="alert" size={16} /> {t('whiteboard.save.error')}
        <button type="button" onClick={onRetry} className="ml-1 min-h-9 underline underline-offset-2">
          {t('whiteboard.save.retry')}
        </button>
      </span>
    );
  return (
    <span role="status" aria-live="polite" className={`${base} bg-primary-soft text-accent-on-soft`}>
      {status === 'saving' && <Spinner size={14} />}
      {status === 'saved' && <Icon name="check" size={16} />}
      {status === 'offline' && <Icon name="wifiOff" size={16} />}
      {t(SAVE_LABEL[status])}
    </span>
  );
}

interface TopBarProps {
  title: string;
  subject: Subject | undefined;
  status: SaveStatus;
  onRetry: () => void;
  mode: 'paged' | 'infinite';
  onMode: (mode: 'paged' | 'infinite') => void;
  menu: MenuItem[];
}

export function TopBar({ title, subject, status, onRetry, mode, onMode, menu }: TopBarProps) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-1 sm:flex-nowrap sm:px-3">
      <Link
        to="/notebooks"
        aria-label={t('whiteboard.back')}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-primary-soft"
      >
        <Icon name="arrowLeft" />
      </Link>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-bold tracking-[0.06em] uppercase ${subject ? SUBJECT_CLASSES[subject.color].text : 'text-ink-muted'}`}
        >
          {subject?.name ?? t('notebooks.noSubject')}
        </p>
        <h1 className="truncate text-sm font-semibold text-ink sm:text-base">{title}</h1>
      </div>
      <SavedChip status={status} onRetry={onRetry} />
      <Segmented
        label={t('whiteboard.mode')}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'paged', label: t('whiteboard.mode.paged') },
          { value: 'infinite', label: t('whiteboard.mode.infinite') },
        ]}
      />
      <button
        type="button"
        aria-label={t('whiteboard.ai')}
        aria-disabled="true"
        title={t('common.comingSoon')}
        className="inline-flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-lg text-ink opacity-60"
      >
        <Icon name="sparkle" />
      </button>
      <Menu label={t('whiteboard.more')} items={menu} />
    </header>
  );
}

interface BottomBarProps {
  mode: 'paged' | 'infinite';
  pageIndex: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onAddPage: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function BottomBar(p: BottomBarProps) {
  return (
    <footer className="flex min-h-14 items-center justify-center gap-1 border-t border-line bg-surface px-2">
      <p className="mr-auto hidden truncate text-xs text-ink-muted lg:block">{t('whiteboard.tip')}</p>
      {p.mode === 'paged' && (
        <>
          <IconButton
            icon="chevronLeft"
            label={t('whiteboard.prevPage')}
            disabled={p.pageIndex === 0}
            onClick={p.onPrev}
          />
          <span
            className="min-w-24 text-center text-sm font-semibold text-ink tabular-nums"
            aria-live="polite"
          >
            {t('whiteboard.pageOf', { page: p.pageIndex + 1, count: p.pageCount })}
          </span>
          <IconButton
            icon="chevronRight"
            label={t('whiteboard.nextPage')}
            disabled={p.pageIndex >= p.pageCount - 1}
            onClick={p.onNext}
          />
          <IconButton icon="plus" label={t('whiteboard.addPage')} onClick={p.onAddPage} />
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        </>
      )}
      <IconButton icon="zoomOut" label={t('whiteboard.zoomOut')} onClick={p.onZoomOut} />
      <button
        type="button"
        onClick={p.onFit}
        title={t('whiteboard.fit')}
        aria-label={t('whiteboard.zoomLevel', { percent: Math.round(p.zoom * 100) })}
        className="min-h-11 min-w-16 rounded-lg px-2 text-sm font-semibold text-ink tabular-nums hover:bg-primary-soft"
      >
        {Math.round(p.zoom * 100)}%
      </button>
      <IconButton icon="zoomIn" label={t('whiteboard.zoomIn')} onClick={p.onZoomIn} />
      <span className="mr-auto hidden lg:block" />
    </footer>
  );
}
