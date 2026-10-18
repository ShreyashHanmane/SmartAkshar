import { useEffect, useId, useRef, useState } from 'react';
import { type AiResponse, type AiStatus, getAiStatus, runAi } from '../../data/ai';
import { ApiError } from '../../data/api';
import { type Deck, createCard, createDeck, subscribeDecks } from '../../data/decks';
import { appendToNote } from '../../data/notes';
import { useLive } from '../../data/useLive';
import { AI_DAILY_LIMIT, AI_LANGUAGES, AI_MAX_TEXT, type AiAction } from '../../shared/schemas';
import { type MessageKey, t } from '../../i18n/i18n';
import { Alert } from '../../ui/Alert';
import { Button, IconButton } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { CreateFlashcardDialog } from '../flashcards/dialogs';

/** What the panel works on. "input" lets the student type or paste text. */
export type AiSource =
  | { kind: 'text'; text: string; label: string }
  | { kind: 'image'; png: string; label: string }
  | { kind: 'input' };

const ACTION_LABEL: Record<AiAction, MessageKey> = {
  summarize: 'ai.action.summarize',
  explain: 'ai.action.explain',
  translate: 'ai.action.translate',
  flashcards: 'ai.action.flashcards',
  handwriting: 'ai.action.handwriting',
};

const ERRORS: Record<string, MessageKey> = {
  'ai-disabled': 'ai.error.disabled',
  quota: 'ai.error.quota',
  'rate-limited': 'ai.error.rate',
  'ai-timeout': 'ai.error.timeout',
  'ai-blocked': 'ai.error.blocked',
  'ai-provider': 'ai.error.provider',
  invalid: 'ai.error.invalid',
  'too-large': 'ai.error.invalid',
  network: 'auth.error.network',
};

interface Props {
  source: AiSource;
  actions: AiAction[];
  /** Run this action as soon as the panel opens (e.g. "Explain" from a menu). */
  autoRun?: AiAction | undefined;
  /** Notebook whose typed notes can receive results. */
  notebookId?: string | null | undefined;
  onClose: () => void;
}

/**
 * The AI panel: a side panel on larger screens, a bottom sheet on phones.
 * Says exactly what is sent to the provider, shows progress with Cancel, and
 * renders answers as plain text only (never HTML).
 */
export function AiPanel({ source, actions, autoRun, notebookId, onClose }: Props) {
  const toast = useToast();
  const headingId = useId();
  const langId = useId();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<(typeof AI_LANGUAGES)[number]>('English');
  const [running, setRunning] = useState<AiAction | null>(null);
  const [result, setResult] = useState<{ action: AiAction; response: AiResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardFromResult, setCardFromResult] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  useEffect(() => {
    getAiStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, limit: AI_DAILY_LIMIT, used: 0 }));
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const text = source.kind === 'text' ? source.text : source.kind === 'input' ? input : undefined;
  const tooLong = (text?.length ?? 0) > AI_MAX_TEXT;
  const enabled = status?.enabled ?? false;

  async function run(action: AiAction) {
    if (!enabled || running) return;
    if (source.kind === 'input' && !input.trim()) {
      setError(t('ai.error.empty'));
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(action);
    setError(null);
    setResult(null);
    try {
      const response = await runAi(
        {
          action,
          ...(source.kind === 'image' ? { image: source.png } : { text: (text ?? '').slice(0, AI_MAX_TEXT) }),
          ...(action === 'translate' ? { targetLanguage: language } : {}),
        },
        controller.signal,
      );
      setResult({ action, response });
      setStatus((s) => (s ? { ...s, used: s.used + 1 } : s));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError(t('ai.cancelled'));
      else setError(t(ERRORS[e instanceof ApiError ? e.code : ''] ?? 'ai.error.provider'));
    } finally {
      setRunning(null);
      abort.current = null;
    }
  }

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    if (autoRun && enabled && !started.current) {
      started.current = true;
      void runRef.current(autoRun);
    }
  }, [enabled, autoRun]);

  return (
    <aside
      role="dialog"
      aria-labelledby={headingId}
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-line bg-surface shadow-2xl md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold text-ink">
          {t('ai.title')}
        </h2>
        <IconButton icon="x" label={t('ai.close')} onClick={onClose} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {status && !status.enabled && (
          <Alert tone="info">
            {t('ai.off')} <code className="font-mono">GEMINI_API_KEY</code> {t('ai.offHint')}
          </Alert>
        )}

        {source.kind === 'input' ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${headingId}-input`} className="text-sm font-semibold text-ink">
              {t('ai.inputLabel')}
            </label>
            <textarea
              id={`${headingId}-input`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              maxLength={AI_MAX_TEXT + 1}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
        ) : (
          <section aria-label={t('ai.material')} className="rounded-xl border border-line bg-canvas p-3">
            <p className="mb-2 text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">
              {source.label}
            </p>
            {source.kind === 'text' ? (
              <p className="line-clamp-6 text-sm whitespace-pre-wrap text-ink">{source.text}</p>
            ) : (
              <img
                src={source.png}
                alt={t('ai.imageAlt')}
                className="max-h-48 w-full rounded-lg bg-white object-contain"
              />
            )}
          </section>
        )}

        <p className="text-xs text-ink-muted">
          {source.kind === 'image' ? t('ai.sendsImage') : t('ai.sendsText', { count: (text ?? '').length })}{' '}
          {status && t('ai.usage', { used: status.used, limit: status.limit })}
        </p>
        {tooLong && <Alert tone="info">{t('ai.trimmed', { max: AI_MAX_TEXT })}</Alert>}

        <div className="flex flex-wrap items-end gap-2">
          {actions.includes('translate') && (
            <div className="flex flex-col gap-1">
              <label htmlFor={langId} className="text-xs font-semibold text-ink">
                {t('ai.language')}
              </label>
              <select
                id={langId}
                value={language}
                onChange={(e) => setLanguage(e.target.value as (typeof AI_LANGUAGES)[number])}
                className="min-h-11 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink"
              >
                {AI_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === actions[0] ? 'primary' : 'secondary'}
              disabled={!enabled || running !== null}
              onClick={() => void run(a)}
            >
              {t(ACTION_LABEL[a])}
            </Button>
          ))}
        </div>

        {running && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm text-ink"
          >
            <span className="flex items-center gap-2">
              <Spinner /> {t('ai.thinking')}
            </span>
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        {result && result.action !== 'flashcards' && (
          <section aria-label={t('ai.result')} className="flex flex-col gap-3">
            {/* Model output is untrusted: rendered as plain text, never as HTML. */}
            <div
              className="rounded-xl border border-line bg-canvas p-3 text-base whitespace-pre-wrap text-ink"
              data-testid="ai-result"
            >
              {result.response.text}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="file"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(result.response.text)
                    .then(() => toast.success(t('ai.copied')))
                    .catch(() => toast.error(t('ai.copyFailed')))
                }
              >
                {t('ai.copy')}
              </Button>
              {notebookId && (
                <Button
                  variant="secondary"
                  icon="plus"
                  onClick={() =>
                    void appendToNote(notebookId, result.response.text)
                      .then(() => toast.success(t('ai.inserted')))
                      .catch(() => toast.error(t('library.error.failed')))
                  }
                >
                  {t('ai.insert')}
                </Button>
              )}
              <Button variant="secondary" icon="cards" onClick={() => setCardFromResult(true)}>
                {t('ai.saveCard')}
              </Button>
            </div>
          </section>
        )}
        {result?.action === 'flashcards' && <GeneratedCards cards={result.response.cards ?? []} />}
      </div>
      {cardFromResult && result && (
        <CreateFlashcardDialog text={result.response.text} onClose={() => setCardFromResult(false)} />
      )}
    </aside>
  );
}

/** Review AI-made cards, untick any you don't want, then save them to a deck. */
function GeneratedCards({ cards }: { cards: { front: string; back: string }[] }) {
  const toast = useToast();
  const decks = useLive<Deck[]>('decks', (next, fail) => subscribeDecks(next, fail));
  const deckId = useId();
  const [keep, setKeep] = useState(() => cards.map(() => true));
  const [target, setTarget] = useState('');
  const [newDeck, setNewDeck] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const list = decks.status === 'ready' ? decks.data : [];
  const chosen = target || list[0]?.id || '';

  async function save() {
    setBusy(true);
    try {
      const deck = chosen || (await createDeck(newDeck.trim() || t('ai.defaultDeck'), null));
      for (const [i, c] of cards.entries()) if (keep[i]) await createCard(deck, c.front, c.back);
      toast.success(t('ai.cardsSaved', { count: keep.filter(Boolean).length }));
      setSaved(true);
    } catch {
      toast.error(t('library.error.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t('ai.result')} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {cards.map((c, i) => (
          <li key={i} className="rounded-xl border border-line bg-canvas p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={keep[i] ?? false}
                onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-1 size-5"
              />
              <span className="min-w-0">
                <span className="block font-semibold whitespace-pre-wrap text-ink">{c.front}</span>
                <span className="block text-sm whitespace-pre-wrap text-ink-muted">{c.back}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {list.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={deckId} className="text-sm font-semibold text-ink">
            {t('flashcards.deck')}
          </label>
          <select
            id={deckId}
            value={chosen}
            onChange={(e) => setTarget(e.target.value)}
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
          onChange={(e) => setNewDeck(e.target.value)}
          maxLength={120}
        />
      )}
      <Button loading={busy} disabled={saved || !keep.some(Boolean)} onClick={() => void save()}>
        {saved ? t('ai.cardsDone') : t('ai.saveCards', { count: keep.filter(Boolean).length })}
      </Button>
    </section>
  );
}
