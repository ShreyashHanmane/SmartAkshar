import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../app/shell/PageHeader';
import {
  type Card,
  type Deck,
  deleteCard,
  deleteDeck,
  loadCards,
  subscribeCards,
  subscribeDecks,
} from '../../data/decks';
import { useLive } from '../../data/useLive';
import { t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Menu } from '../../ui/Menu';
import { useToast } from '../../ui/Toast';
import { DeckDialog, EditCardDialog, NewCardForm } from './dialogs';
import { useQuickExport } from '../export/ExportDialog';
import { deckCsv, safeFileName } from '../export/exporters';

export function DeckPage() {
  const { deckId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const decks = useLive<Deck[]>('decks', (next, fail) => subscribeDecks(next, fail));
  const cards = useLive<Card[]>(deckId, (next, fail) => subscribeCards(deckId, next, fail));
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const quickExport = useQuickExport();
  const [editing, setEditing] = useState<Card | null>(null);
  const deck = decks.status === 'ready' ? decks.data.find((d) => d.id === deckId) : undefined;

  if (decks.status === 'ready' && !deck)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-ink">{t('flashcards.deckNotFound')}</h1>
        <Link to="/flashcards" className="font-semibold text-accent">
          {t('flashcards.backToDecks')}
        </Link>
      </div>
    );
  if (!deck) return <div aria-hidden="true" className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/flashcards"
        className="w-fit text-sm font-semibold text-accent underline-offset-2 hover:underline"
      >
        ← {t('flashcards.backToDecks')}
      </Link>
      <PageHeader
        title={deck.title}
        actions={
          <>
            {deck.due > 0 && (
              <Link
                to={`/flashcards/review?deck=${encodeURIComponent(deck.id)}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary"
              >
                {t('flashcards.reviewDue', { count: deck.due })}
              </Link>
            )}
            {deck.total >= 2 && (
              <Link
                to={`/flashcards/${deck.id}/quiz`}
                className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-primary-soft"
              >
                {t('flashcards.quiz')}
              </Link>
            )}
            <Menu
              label={t('flashcards.deckActions')}
              items={[
                { label: t('notebooks.rename'), icon: 'pencil', onSelect: () => setDialog('rename') },
                {
                  label: t('export.csv'),
                  icon: 'download',
                  onSelect: () =>
                    void quickExport(async () => ({
                      blob: deckCsv(deck.title, await loadCards(deck.id)),
                      name: safeFileName(deck.title, 'csv'),
                    })),
                },
                {
                  label: t('common.delete'),
                  icon: 'trash',
                  danger: true,
                  onSelect: () => setDialog('delete'),
                },
              ]}
            />
          </>
        }
      />
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">{t('flashcards.newCard')}</h2>
        <NewCardForm deckId={deck.id} formId="deck-new-card" />
      </section>
      <section aria-labelledby="cards-heading" className="flex flex-col gap-3">
        <h2 id="cards-heading" className="text-lg font-semibold text-ink">
          {t('flashcards.cards', { count: deck.total })}
        </h2>
        {cards.status === 'error' && <Alert tone="error">{t('flashcards.loadFailed')}</Alert>}
        {cards.status === 'ready' && cards.data.length === 0 && (
          <p className="text-ink-muted">{t('flashcards.emptyDeck')}</p>
        )}
        {cards.status === 'ready' && (
          <ul className="flex flex-col gap-2">
            {cards.data.map((c) => (
              <li key={c.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                  <p className="font-semibold whitespace-pre-wrap text-ink">{c.front}</p>
                  <p className="whitespace-pre-wrap text-ink-muted">{c.back}</p>
                </div>
                <Menu
                  label={t('flashcards.cardActions', { front: c.front.slice(0, 40) })}
                  items={[
                    { label: t('flashcards.edit'), icon: 'pencil', onSelect: () => setEditing(c) },
                    {
                      label: t('common.delete'),
                      icon: 'trash',
                      danger: true,
                      onSelect: () =>
                        void deleteCard(c.id).catch(() => toast.error(t('library.error.failed'))),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && <EditCardDialog card={editing} onClose={() => setEditing(null)} />}
      {dialog === 'rename' && <DeckDialog deck={deck} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <Dialog
          open
          title={t('flashcards.deleteDeck', { title: deck.title })}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  void deleteDeck(deck.id)
                    .then(() => navigate('/flashcards'))
                    .catch(() => toast.error(t('library.error.failed')))
                }
              >
                {t('common.delete')}
              </Button>
            </>
          }
        >
          {t('flashcards.deleteDeckBody', { count: deck.total })}
        </Dialog>
      )}
    </div>
  );
}
