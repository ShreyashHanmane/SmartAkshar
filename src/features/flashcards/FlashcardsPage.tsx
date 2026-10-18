import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../app/shell/PageHeader';
import { type Deck, type FlashcardStats, subscribeDecks, subscribeStats } from '../../data/decks';
import { useLive } from '../../data/useLive';
import { type MessageKey, t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { SUBJECT_CLASSES } from '../subjects/subjectColors';
import { useSubject } from '../subjects/SubjectsProvider';
import { DeckDialog, NewCardForm } from './dialogs';

type Tab = 'decks' | 'progress' | 'create';
const TABS: { value: Tab; label: MessageKey }[] = [
  { value: 'decks', label: 'flashcards.tab.decks' },
  { value: 'progress', label: 'flashcards.tab.progress' },
  { value: 'create', label: 'flashcards.tab.create' },
];
const BOX_LABEL: MessageKey[] = [
  'flashcards.box1',
  'flashcards.box2',
  'flashcards.box3',
  'flashcards.box4',
  'flashcards.box5',
];

function DeckCard({ deck }: { deck: Deck }) {
  const subject = useSubject(deck.subjectId);
  const pct = deck.total ? Math.round((deck.learned / deck.total) * 100) : 0;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <p
        className={`truncate text-xs font-bold tracking-[0.06em] uppercase ${subject ? SUBJECT_CLASSES[subject.color].text : 'text-ink-muted'}`}
      >
        {subject?.name ?? t('notebooks.noSubject')}
      </p>
      <h2 className="text-lg font-semibold text-ink">
        <Link to={`/flashcards/${deck.id}`} className="underline-offset-2 hover:underline">
          {deck.title}
        </Link>
      </h2>
      <p className="text-sm text-ink-muted">
        {t('flashcards.cards', { count: deck.total })} ·{' '}
        {deck.total === 0 || deck.due === 0 ? (
          t('flashcards.caughtUp')
        ) : (
          <span className="font-semibold text-accent">{t('flashcards.due', { count: deck.due })}</span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label={t('flashcards.learnedProgress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-track"
      >
        <div className="h-full rounded-full bg-progress" style={{ width: `${pct}%` }} />
      </div>
      {deck.total === 0 ? (
        <p className="text-sm text-ink-muted">{t('flashcards.emptyDeck')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {deck.due > 0 ? (
            <Link
              to={`/flashcards/review?deck=${encodeURIComponent(deck.id)}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary"
              aria-label={t('flashcards.reviewDeck', { title: deck.title })}
            >
              {t('flashcards.review')}
            </Link>
          ) : null}
          {deck.total >= 2 && (
            <Link
              to={`/flashcards/${deck.id}/quiz`}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-primary-soft"
              aria-label={t('flashcards.quizDeck', { title: deck.title })}
            >
              {t('flashcards.quiz')}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function Progress({ decks }: { decks: Deck[] }) {
  const stats = useLive<FlashcardStats>('stats', (next, fail) => subscribeStats(next, fail));
  if (stats.status === 'loading')
    return <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  if (stats.status === 'error') return <Alert tone="error">{t('dashboard.statsFailed')}</Alert>;
  const s = stats.data;
  const max = Math.max(1, ...s.boxes);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          [t('flashcards.stat.total'), s.total],
          [t('flashcards.stat.due'), s.dueToday],
          [t('flashcards.stat.reviewed'), s.reviewedToday],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-surface p-5">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="text-3xl font-bold text-accent">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="boxes" className="rounded-2xl border border-line bg-surface p-5">
        <h2 id="boxes" className="mb-1 text-lg font-semibold text-ink">
          {t('flashcards.boxesTitle')}
        </h2>
        <p className="mb-4 text-sm text-ink-muted">{t('flashcards.boxesHint')}</p>
        <ul className="flex flex-col gap-3">
          {s.boxes.map((count, i) => (
            <li key={i} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="text-ink">{t(BOX_LABEL[i] ?? 'flashcards.box1')}</span>
              <span className="h-3 overflow-hidden rounded-full bg-track" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-progress"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold text-ink tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </section>
      {decks.length > 0 && (
        <section aria-labelledby="per-deck" className="rounded-2xl border border-line bg-surface p-5">
          <h2 id="per-deck" className="mb-4 text-lg font-semibold text-ink">
            {t('flashcards.perDeck')}
          </h2>
          <ul className="flex flex-col gap-3">
            {decks.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{d.title}</span>
                <span className="text-ink-muted">
                  {t('flashcards.learnedOf', { learned: d.learned, total: d.total })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function FlashcardsPage() {
  const decks = useLive<Deck[]>('decks', (next, fail) => subscribeDecks(next, fail));
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((x) => x.value === params.get('tab'))?.value ?? 'decks') as Tab;
  const [creating, setCreating] = useState(false);
  const list = decks.status === 'ready' ? decks.data : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.flashcards')}
        actions={
          <Button icon="plus" onClick={() => setCreating(true)}>
            {t('flashcards.createDeck')}
          </Button>
        }
      >
        <div role="tablist" aria-label={t('nav.flashcards')} className="flex gap-1 border-b border-line">
          {TABS.map((x) => (
            <button
              key={x.value}
              type="button"
              role="tab"
              aria-selected={tab === x.value}
              onClick={() => setParams(x.value === 'decks' ? {} : { tab: x.value }, { replace: true })}
              className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === x.value ? 'border-primary text-accent' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
      </PageHeader>

      {decks.status === 'loading' && (
        <div aria-hidden="true" className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />
      )}
      {decks.status === 'error' && <Alert tone="error">{t('flashcards.loadFailed')}</Alert>}
      {decks.status === 'ready' && tab === 'decks' && (
        <>
          {list.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-line-strong bg-surface p-8 text-center">
              <p className="text-base text-ink">{t('flashcards.noDecks')}</p>
              <p className="mt-1 text-sm text-ink-muted">{t('flashcards.noDecksHint')}</p>
            </div>
          )}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
            {list.map((d) => (
              <DeckCard key={d.id} deck={d} />
            ))}
          </ul>
        </>
      )}
      {decks.status === 'ready' && tab === 'progress' && <Progress decks={list} />}
      {decks.status === 'ready' && tab === 'create' && (
        <section className="max-w-2xl rounded-2xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-ink">{t('flashcards.newCard')}</h2>
          <NewCardForm />
        </section>
      )}
      {creating && <DeckDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
