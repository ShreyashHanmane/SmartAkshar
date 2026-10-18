import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignedInUser } from '../../app/session/SessionProvider';
import { type SearchItem, loadSearchIndex } from '../../data/search';
import { type MessageKey, t } from '../../i18n/i18n';
import { Icon, type IconName } from '../../ui/Icon';
import { searchItems } from './match';

const KIND: Record<SearchItem['kind'], { label: MessageKey; icon: IconName }> = {
  subject: { label: 'search.kind.subject', icon: 'menu' },
  notebook: { label: 'search.kind.notebook', icon: 'whiteboard' },
  book: { label: 'search.kind.book', icon: 'book' },
  deck: { label: 'search.kind.deck', icon: 'cards' },
};

type IndexState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; items: SearchItem[] };

/** Global search over the user's subjects, notebooks, books, and flashcard decks (ARIA combobox). */
export function SearchBox({
  autoFocus = false,
  initialQuery = '',
}: {
  autoFocus?: boolean;
  initialQuery?: string;
}) {
  const { uid } = useSignedInUser();
  const navigate = useNavigate();
  const listId = useId();
  const [value, setValue] = useState(initialQuery);
  const [open, setOpen] = useState(initialQuery !== '');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<IndexState>({ status: 'idle' });
  const loading = useRef(false);

  function refreshIndex() {
    if (loading.current) return;
    loading.current = true;
    setIndex((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    loadSearchIndex(uid)
      .then((items) => setIndex({ status: 'ready', items }))
      .catch(() => setIndex({ status: 'error' }))
      .finally(() => {
        loading.current = false;
      });
  }

  const results = useMemo(
    () => (index.status === 'ready' ? searchItems(index.items, value) : []),
    [index, value],
  );
  const showList = open && value.trim() !== '';

  function go(item: SearchItem | undefined) {
    if (!item) return;
    setOpen(false);
    navigate(item.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Enter') go(results[active]);
    else if (e.key === 'Escape') {
      if (value) setValue('');
      setOpen(false);
    } else return;
    e.preventDefault();
  }

  return (
    <div className="relative w-full">
      <Icon
        name="search"
        size={18}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
      />
      <input
        type="search"
        role="combobox"
        aria-label={t('search.label')}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        placeholder={t('search.placeholder')}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => {
          refreshIndex();
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-10 text-base text-ink placeholder:text-ink-muted"
      />
      {showList && (
        <div className="absolute top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label={t('search.results')}
            className="max-h-80 overflow-y-auto py-1"
          >
            {results.map((item, i) => (
              <li
                key={`${item.kind}-${item.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm ${i === active ? 'bg-primary-soft' : ''}`}
              >
                <Icon name={KIND[item.kind].icon} size={18} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{item.title}</span>
                  {item.detail && (
                    <span className="block truncate text-xs text-ink-muted">{item.detail}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{t(KIND[item.kind].label)}</span>
              </li>
            ))}
          </ul>
          {index.status === 'loading' && (
            <p className="px-3 py-3 text-sm text-ink-muted">{t('common.loading')}</p>
          )}
          {index.status === 'error' && <p className="px-3 py-3 text-sm text-danger">{t('search.failed')}</p>}
          {index.status === 'ready' && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-muted">
              {t('search.noResults', { query: value.trim() })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
