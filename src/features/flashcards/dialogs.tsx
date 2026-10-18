import { type FormEvent, useId, useState } from 'react';
import { type Card, type Deck, createCard, createDeck, updateCard, updateDeck } from '../../data/decks';
import { useLive } from '../../data/useLive';
import { subscribeDecks } from '../../data/decks';
import { t } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useSubjects } from '../subjects/SubjectsProvider';
import { CARD_TEXT_MAX } from '../../shared/schemas';

function SubjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const subjects = useSubjects();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {t('notebooks.subject')}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}

/** Create or rename a deck (title + subject). */
export function DeckDialog({
  deck,
  onClose,
  onCreated,
}: {
  deck?: Deck;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(deck?.title ?? '');
  const [subjectId, setSubjectId] = useState(deck?.subjectId ?? '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('flashcards.deckTitleRequired'));
    setBusy(true);
    try {
      if (deck) await updateDeck(deck.id, { title: title.trim(), subjectId: subjectId || null });
      else {
        // Create first: `onCreated?.(await …)` would skip the call entirely when no callback is passed.
        const id = await createDeck(title, subjectId || null);
        onCreated?.(id);
      }
      toast.success(deck ? t('flashcards.deckSaved') : t('flashcards.deckCreated'));
      onClose();
    } catch {
      toast.error(t('library.error.failed'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={deck ? t('flashcards.renameDeck') : t('flashcards.newDeck')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="deck-form" loading={busy}>
            {deck ? t('common.save') : t('flashcards.createDeck')}
          </Button>
        </>
      }
    >
      <form id="deck-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('flashcards.deckTitle')}
          value={title}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(undefined);
          }}
          error={error}
          autoFocus
        />
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
      </form>
    </Dialog>
  );
}

function CardFields({
  front,
  back,
  setFront,
  setBack,
  errors,
}: {
  front: string;
  back: string;
  setFront: (v: string) => void;
  setBack: (v: string) => void;
  errors: { front?: string | undefined; back?: string | undefined };
}) {
  const frontId = useId();
  const backId = useId();
  const area = (error?: string) =>
    `min-h-24 w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink ${error ? 'border-danger' : 'border-line-strong'}`;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={frontId} className="text-sm font-semibold text-ink">
          {t('flashcards.front')}
        </label>
        <textarea
          id={frontId}
          value={front}
          maxLength={CARD_TEXT_MAX}
          onChange={(e) => setFront(e.target.value)}
          className={area(errors.front)}
          aria-invalid={errors.front ? true : undefined}
        />
        {errors.front && <p className="text-sm text-danger">{errors.front}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={backId} className="text-sm font-semibold text-ink">
          {t('flashcards.back')}
        </label>
        <textarea
          id={backId}
          value={back}
          maxLength={CARD_TEXT_MAX}
          onChange={(e) => setBack(e.target.value)}
          className={area(errors.back)}
          aria-invalid={errors.back ? true : undefined}
        />
        {errors.back && <p className="text-sm text-danger">{errors.back}</p>}
      </div>
    </>
  );
}

function validate(front: string, back: string) {
  return {
    ...(front.trim() ? {} : { front: t('flashcards.frontRequired') }),
    ...(back.trim() ? {} : { back: t('flashcards.backRequired') }),
  };
}

/** Edit an existing card's two sides. */
export function EditCardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const toast = useToast();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [errors, setErrors] = useState<{ front?: string; back?: string }>({});

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate(front, back);
    setErrors(v);
    if (Object.keys(v).length) return;
    updateCard(card.id, { front: front.trim(), back: back.trim() }).catch(() =>
      toast.error(t('library.error.failed')),
    );
    onClose();
  }

  return (
    <Dialog
      open
      title={t('flashcards.editCard')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-card">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="edit-card" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <CardFields front={front} back={back} setFront={setFront} setBack={setBack} errors={errors} />
      </form>
    </Dialog>
  );
}

/**
 * New card form, used on the Create tab, deck pages, and from the reader
 * ("Create flashcard" with the selected text as the answer).
 */
export function NewCardForm({
  deckId: fixedDeck,
  initialBack = '',
  onDone,
  formId = 'new-card',
  hideSubmit = false,
}: {
  deckId?: string;
  initialBack?: string;
  onDone?: () => void;
  formId?: string;
  hideSubmit?: boolean;
}) {
  const toast = useToast();
  const decks = useLive<Deck[]>('decks', (next, fail) => subscribeDecks(next, fail));
  const deckSelectId = useId();
  const [deckId, setDeckId] = useState(fixedDeck ?? '');
  const [newDeck, setNewDeck] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState(initialBack);
  const [errors, setErrors] = useState<{ front?: string; back?: string; deck?: string }>({});
  const [busy, setBusy] = useState(false);
  const list = decks.status === 'ready' ? decks.data : [];
  const chosen = fixedDeck ?? (deckId || list[0]?.id || '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v: { front?: string; back?: string; deck?: string } = validate(front, back);
    if (!chosen && !newDeck.trim()) v.deck = t('flashcards.deckTitleRequired');
    setErrors(v);
    if (Object.keys(v).length) return;
    // Clear right away so the next card can be typed immediately; restore on failure.
    const values = { front, back };
    setFront('');
    setBack('');
    setBusy(true);
    try {
      const target = chosen || (await createDeck(newDeck, null));
      await createCard(target, values.front, values.back);
      toast.success(t('flashcards.cardAdded'));
      onDone?.();
    } catch {
      setFront(values.front);
      setBack(values.back);
      toast.error(t('library.error.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {!fixedDeck &&
        (list.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={deckSelectId} className="text-sm font-semibold text-ink">
              {t('flashcards.deck')}
            </label>
            <select
              id={deckSelectId}
              value={chosen}
              onChange={(e) => setDeckId(e.target.value)}
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
            >
              {list.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <TextField
            label={t('flashcards.newDeckName')}
            value={newDeck}
            maxLength={120}
            onChange={(e) => setNewDeck(e.target.value)}
            error={errors.deck}
            hint={t('flashcards.newDeckHint')}
          />
        ))}
      <CardFields front={front} back={back} setFront={setFront} setBack={setBack} errors={errors} />
      {!hideSubmit && (
        <Button type="submit" loading={busy} className="self-start">
          {t('flashcards.addCard')}
        </Button>
      )}
    </form>
  );
}

/** "Create flashcard" from selected text in the reader. */
export function CreateFlashcardDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Dialog
      open
      title={t('reader.createFlashcard')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="reader-card">
            {t('flashcards.addCard')}
          </Button>
        </>
      }
    >
      <NewCardForm
        initialBack={text.slice(0, CARD_TEXT_MAX)}
        onDone={onClose}
        formId="reader-card"
        hideSubmit
      />
    </Dialog>
  );
}
