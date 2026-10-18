import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { useSettings } from '../../app/settings/SettingsProvider';
import { type ActivityByDay, subscribeActivity } from '../../data/activity';
import { type BookSummary, subscribeRecentBooks } from '../../data/books';
import { subscribeDueCount } from '../../data/cards';
import { useLive } from '../../data/useLive';
import { type MessageKey, t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useOnline } from '../../ui/useOnline';
import { CreateNotebookCard, NotebookCard, NotebookGridSkeleton } from '../notebooks/NotebookCard';
import { useNotebooks } from '../notebooks/NotebooksProvider';
import { useNewNotebook } from '../notebooks/NewNotebookProvider';
import { relativeTime } from '../notebooks/time';
import { SearchBox } from '../search/SearchBox';
import { AiPanel } from '../ai/AiPanel';
import { GoalDialog } from './GoalDialog';
import {
  type DayPart,
  activityWindowStart,
  dayPart,
  focusHoursThisWeek,
  goalPercent,
  studyStreak,
} from './stats';

const GREETING: Record<DayPart, MessageKey> = {
  morning: 'dashboard.greeting.morning',
  afternoon: 'dashboard.greeting.afternoon',
  evening: 'dashboard.greeting.evening',
};

const RECENT_NOTEBOOKS = 7;
const RECENT_BOOKS = 4;

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-h-40 flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
      {children}
    </section>
  );
}

function GoalRing({ percent }: { percent: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-track" />
      {percent > 0 && (
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          transform="rotate(-90 42 42)"
          className="stroke-progress"
        />
      )}
      <text x="42" y="47" textAnchor="middle" className="fill-ink text-sm font-bold">
        {percent}%
      </text>
    </svg>
  );
}

function BookRow({ book, now }: { book: BookSummary; now: number }) {
  const badge = { pdf: 'bg-file-pdf', epub: 'bg-file-epub', txt: 'bg-file-txt' }[book.format];
  return (
    <li>
      <Link
        to={`/library/${book.id}`}
        className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
      >
        <span
          className={`inline-flex size-10 shrink-0 items-end justify-center rounded-md pb-1 text-[0.75rem] font-bold text-on-primary uppercase ${badge}`}
        >
          {book.format}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{book.title}</span>
          <span className="block truncate text-sm text-ink-muted">
            {[
              book.author,
              book.openedAt ? t('books.opened', { when: relativeTime(book.openedAt, now) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const user = useSignedInUser();
  const { settings } = useSettings();
  const online = useOnline();
  const notebooks = useNotebooks();
  const openNew = useNewNotebook();
  const [editingGoal, setEditingGoal] = useState(false);
  const [asking, setAsking] = useState(false);
  // Fixed per mount: relative times and stats don't need per-second updates.
  const [now] = useState(() => Date.now());
  const today = useMemo(() => new Date(now), [now]);

  const activity = useLive<ActivityByDay>(user.uid, (next, fail) =>
    subscribeActivity(user.uid, activityWindowStart(today), next, fail),
  );
  const due = useLive<number>(user.uid, (next, fail) => subscribeDueCount(user.uid, next, fail));
  const books = useLive<BookSummary[]>(user.uid, (next, fail) =>
    subscribeRecentBooks(user.uid, RECENT_BOOKS, next, fail),
  );

  const days = activity.status === 'ready' ? activity.data : {};
  const hours = focusHoursThisWeek(days, today);
  const streak = studyStreak(days, today);
  const percent = goalPercent(hours, settings.weeklyGoalHours);
  const name = user.displayName;
  const dateLabel = new Intl.DateTimeFormat(settings.locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(today);
  const greeting = t(GREETING[dayPart(today)]);
  const hoursLabel = new Intl.NumberFormat(settings.locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(hours);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden w-full max-w-lg md:block">
          <SearchBox />
        </div>
        <Button variant="secondary" icon="sparkle" onClick={() => setAsking(true)}>
          {t('dashboard.askAi')}
        </Button>
      </div>

      {!online && <Alert tone="offline">{t('dashboard.offline')}</Alert>}

      <header>
        <p className="text-sm text-ink-muted">{dateLabel}</p>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          {greeting}, <span className="text-accent">{name}</span>
        </h1>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard>
          <h2 className="text-sm text-ink-muted">{t('dashboard.thisWeek')}</h2>
          {activity.status === 'loading' ? (
            <div aria-hidden="true" className="h-9 w-24 animate-pulse rounded bg-surface-sunken" />
          ) : (
            <p className="text-ink-muted">
              <span className="text-3xl font-bold text-accent">{hoursLabel}</span>{' '}
              {t('dashboard.hoursFocused')}
            </p>
          )}
          {activity.status === 'error' && <p className="text-sm text-danger">{t('dashboard.statsFailed')}</p>}
        </StatCard>

        <StatCard>
          <h2 className="text-sm text-ink-muted">{t('dashboard.flashcardsDue')}</h2>
          {due.status === 'loading' ? (
            <div aria-hidden="true" className="h-9 w-24 animate-pulse rounded bg-surface-sunken" />
          ) : due.status === 'error' ? (
            <p className="text-sm text-danger">{t('dashboard.statsFailed')}</p>
          ) : (
            <>
              <p className="text-ink-muted">
                <span className="text-3xl font-bold text-accent">{due.data}</span> {t('dashboard.cardsToday')}
              </p>
              {due.data > 0 ? (
                <Link
                  to="/flashcards/review"
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary"
                >
                  {t('dashboard.reviewNow')} <Icon name="arrowRight" size={18} />
                </Link>
              ) : (
                <p className="text-sm text-ink-muted">{t('dashboard.allCaughtUp')}</p>
              )}
            </>
          )}
        </StatCard>

        <StatCard>
          <div className="flex items-center gap-4">
            <GoalRing percent={percent} />
            <div className="min-w-0">
              <h2 className="text-sm text-ink-muted">
                {t('dashboard.weeklyGoal', { hours: settings.weeklyGoalHours })}
              </h2>
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Icon name="flame" size={18} /> {t('dashboard.streak', { days: streak })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingGoal(true)}
            className="mt-auto min-h-11 w-fit rounded-lg px-2 text-sm font-semibold text-accent hover:bg-primary-soft"
          >
            {t('dashboard.editGoal')}
          </button>
        </StatCard>
      </div>

      <section aria-labelledby="recent-notebooks" className="flex flex-col gap-4">
        <h2 id="recent-notebooks" className="text-2xl font-semibold text-ink">
          {t('dashboard.recentNotebooks')}
          {notebooks.status === 'ready' && (
            <span className="ml-1 text-sm font-normal text-ink-muted">· {notebooks.data.length}</span>
          )}
        </h2>
        {notebooks.status === 'loading' && <NotebookGridSkeleton />}
        {notebooks.status === 'error' && <Alert tone="error">{t('notebooks.loadFailed')}</Alert>}
        {notebooks.status === 'ready' && (
          <>
            {notebooks.data.length === 0 && <p className="text-ink-muted">{t('dashboard.noNotebooks')}</p>}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
              {notebooks.data.slice(0, RECENT_NOTEBOOKS).map((n) => (
                <li key={n.id}>
                  <NotebookCard notebook={n} now={now} />
                </li>
              ))}
              <li>
                <CreateNotebookCard onCreate={() => openNew()} />
              </li>
            </ul>
            {notebooks.data.length > RECENT_NOTEBOOKS && (
              <Link
                to="/notebooks"
                className="w-fit font-semibold text-accent underline-offset-2 hover:underline"
              >
                {t('dashboard.allNotebooks')}
              </Link>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="recent-books" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-books" className="text-2xl font-semibold text-ink">
            {t('dashboard.recentBooks')}
          </h2>
          <Link to="/library" className="font-semibold text-accent underline-offset-2 hover:underline">
            {t('dashboard.openLibrary')}
          </Link>
        </div>
        {books.status === 'loading' && (
          <div aria-hidden="true" className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
        )}
        {books.status === 'error' && <Alert tone="error">{t('dashboard.booksFailed')}</Alert>}
        {books.status === 'ready' && books.data.length === 0 && (
          <p className="text-ink-muted">{t('dashboard.noBooks')}</p>
        )}
        {books.status === 'ready' && books.data.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {books.data.map((b) => (
              <BookRow key={b.id} book={b} now={now} />
            ))}
          </ul>
        )}
      </section>

      {editingGoal && <GoalDialog onClose={() => setEditingGoal(false)} />}
      {asking && (
        <AiPanel
          source={{ kind: 'input' }}
          actions={['explain', 'summarize', 'translate', 'flashcards']}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}
