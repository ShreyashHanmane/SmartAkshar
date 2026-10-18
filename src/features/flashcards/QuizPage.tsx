import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStudyTracker } from '../../app/study/useStudyTracker';
import { type Card, loadCards } from '../../data/decks';
import { quizOptions, shuffle } from '../../shared/leitner';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

const QUESTIONS = 10;

/** Multiple-choice practice from a deck (doesn't change the review schedule). */
export function QuizPage() {
  const { deckId = '' } = useParams();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  useStudyTracker();

  useEffect(() => {
    loadCards(deckId)
      .then((all) => setCards(shuffle(all).slice(0, QUESTIONS)))
      .catch(() => setFailed(true));
  }, [deckId]);

  const pool = useMemo(() => (cards ?? []).map((c) => c.back), [cards]);
  const card = cards?.[index];
  const options = useMemo(() => (card ? quizOptions(card.back, pool) : []), [card, pool]);

  if (failed) return <Alert tone="error">{t('flashcards.loadFailed')}</Alert>;
  if (!cards)
    return (
      <div aria-hidden="true" className="mx-auto h-72 max-w-xl animate-pulse rounded-2xl bg-surface-sunken" />
    );
  if (cards.length < 2)
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Alert tone="info">{t('flashcards.quizNeedsTwo')}</Alert>
        <Link to={`/flashcards/${deckId}`} className="font-semibold text-accent">
          {t('flashcards.backToDecks')}
        </Link>
      </div>
    );
  if (!card)
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
        <h1 className="text-2xl font-bold text-ink">{t('flashcards.quizDone')}</h1>
        <p className="text-lg text-ink" aria-live="polite">
          {t('flashcards.quizScore', { score, total: cards.length })}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setCards(shuffle(cards));
              setIndex(0);
              setScore(0);
              setPicked(null);
            }}
          >
            {t('flashcards.quizAgain')}
          </Button>
          <Link
            to="/flashcards"
            className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-ink"
          >
            {t('flashcards.backToDecks')}
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('flashcards.quiz')}</h1>
        <p className="text-sm text-ink-muted">
          {t('flashcards.questionOf', { n: index + 1, total: cards.length })}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-bold tracking-[0.08em] text-ink-muted uppercase">
          {t('flashcards.question')}
        </p>
        <p className="mt-2 text-xl font-semibold whitespace-pre-wrap text-ink">{card.front}</p>
      </div>
      <div role="radiogroup" aria-label={t('flashcards.chooseAnswer')} className="flex flex-col gap-2">
        {options.map((option) => {
          const correct = option === card.back;
          const chosen = picked === option;
          const state =
            picked === null
              ? ''
              : correct
                ? 'border-success bg-surface'
                : chosen
                  ? 'border-danger bg-surface'
                  : 'opacity-60';
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={picked !== null}
              onClick={() => {
                setPicked(option);
                if (correct) setScore((s) => s + 1);
              }}
              className={`flex min-h-12 items-center gap-3 rounded-xl border-2 border-line bg-surface px-4 py-3 text-left text-base text-ink disabled:cursor-default ${state}`}
            >
              <span className="flex-1 whitespace-pre-wrap">{option}</span>
              {picked !== null && correct && <Icon name="check" className="text-success" />}
              {picked !== null && chosen && !correct && <Icon name="x" className="text-danger" />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-base font-semibold text-ink">
            {picked === card.back
              ? t('flashcards.correct')
              : t('flashcards.incorrect', { answer: card.back })}
          </p>
          <Button
            onClick={() => {
              setIndex((i) => i + 1);
              setPicked(null);
            }}
          >
            {index + 1 < cards.length ? t('flashcards.next') : t('flashcards.seeScore')}
          </Button>
        </div>
      )}
    </div>
  );
}
