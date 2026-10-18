import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStudyTracker } from '../../app/study/useStudyTracker';
import { type Card, loadDueCards, reviewCard } from '../../data/decks';
import type { ReviewResult } from '../../shared/leitner';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

const SWIPE_PX = 100;

/**
 * Review due cards: tap (or Space) to flip, then swipe right / → for "Know it"
 * or left / ← for "Don't know". Results feed the Leitner scheduler. Cards you
 * don't know come back once more at the end of the session.
 */
export function ReviewPage() {
  const [params] = useSearchParams();
  const deckId = params.get('deck') ?? undefined;
  const toast = useToast();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; dx: number } | null>(null);
  const [tally, setTally] = useState({ know: 0, again: 0 });
  const retried = useRef(new Set<string>());
  const cardRef = useRef<HTMLDivElement>(null);
  useStudyTracker();

  useEffect(() => {
    loadDueCards(deckId)
      .then(setQueue)
      .catch(() => setFailed(true));
  }, [deckId]);

  const card = queue?.[0];
  const cardId = card?.id;

  useEffect(() => {
    cardRef.current?.focus();
  }, [cardId]);

  function answer(result: ReviewResult) {
    if (!card || !queue) return;
    reviewCard(card.id, result).catch(() => toast.error(t('flashcards.saveFailed')));
    setTally((s) => ({ ...s, [result]: s[result] + 1 }));
    const rest = queue.slice(1);
    // Show a forgotten card once more at the end of this session.
    if (result === 'again' && !retried.current.has(card.id)) {
      retried.current.add(card.id);
      rest.push(card);
    }
    setQueue(rest);
    setFlipped(false);
    setDrag(null);
  }

  // Keyboard review works wherever focus is (except while typing in a field).
  const keyRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyRef.current = (e) => {
      if (
        (e.target as HTMLElement | null)?.closest('input, textarea, select, button:not([data-review-card])')
      )
        return;
      if (!card) return;
      if (e.key === ' ' || e.key === 'Enter') setFlipped((f) => !f);
      else if (e.key === 'ArrowRight' && flipped) answer('know');
      else if (e.key === 'ArrowLeft' && flipped) answer('again');
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, dx: 0 });
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.startX });
  }
  function onPointerUp() {
    if (!drag) return;
    if (Math.abs(drag.dx) < 8) setFlipped((f) => !f);
    else if (flipped && drag.dx > SWIPE_PX) return answer('know');
    else if (flipped && drag.dx < -SWIPE_PX) return answer('again');
    setDrag(null);
  }

  if (failed) return <Alert tone="error">{t('flashcards.loadFailed')}</Alert>;
  if (!queue)
    return (
      <div aria-hidden="true" className="mx-auto h-72 max-w-xl animate-pulse rounded-2xl bg-surface-sunken" />
    );

  if (!card)
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {tally.know + tally.again ? t('flashcards.sessionDone') : t('flashcards.nothingDue')}
        </h1>
        {tally.know + tally.again > 0 && (
          <p className="text-base text-ink-muted">
            {t('flashcards.sessionSummary', { know: tally.know, again: tally.again })}
          </p>
        )}
        <Link
          to="/flashcards"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary"
        >
          {t('flashcards.backToDecks')}
        </Link>
      </div>
    );

  const dx = drag?.dx ?? 0;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('flashcards.review')}</h1>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {t('flashcards.remaining', { count: queue.length })}
        </p>
      </div>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label={flipped ? t('flashcards.answerShown') : t('flashcards.tapToFlip')}
        data-review-card
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)`, touchAction: 'pan-y' }}
        className={`flex min-h-72 cursor-grab flex-col items-center justify-center gap-4 rounded-2xl border-2 bg-surface p-8 text-center shadow-sm select-none motion-safe:transition-transform ${dx > SWIPE_PX ? 'border-success' : dx < -SWIPE_PX ? 'border-danger' : 'border-line'}`}
      >
        <p className="text-xs font-bold tracking-[0.08em] text-ink-muted uppercase">
          {flipped ? t('flashcards.back') : t('flashcards.front')}
        </p>
        <p className="text-xl font-semibold whitespace-pre-wrap text-ink" data-testid="card-text">
          {flipped ? card.back : card.front}
        </p>
        {!flipped && <p className="text-sm text-ink-muted">{t('flashcards.flipHint')}</p>}
      </div>
      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => answer('again')}>
            ← {t('flashcards.dontKnow')}
          </Button>
          <Button onClick={() => answer('know')}>{t('flashcards.knowIt')} →</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setFlipped(true)}>
          {t('flashcards.showAnswer')}
        </Button>
      )}
      <p className="text-center text-xs text-ink-muted">{t('flashcards.swipeHint')}</p>
    </div>
  );
}
