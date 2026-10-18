import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { t } from '../i18n/i18n';
import { Icon } from './Icon';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(tone: Tone, message: string) => void>(() => undefined);

let nextId = 1;
const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId++;
      setItems((all) => [...all.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? DURATION_MS * 2 : DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink shadow-lg"
          >
            <Icon
              name={item.tone === 'error' ? 'alert' : item.tone === 'success' ? 'check' : 'info'}
              size={18}
              className={
                item.tone === 'error'
                  ? 'text-danger'
                  : item.tone === 'success'
                    ? 'text-success'
                    : 'text-accent'
              }
            />
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={t('common.dismiss')}
              className="inline-flex size-8 items-center justify-center rounded text-ink-muted hover:text-ink"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(
    () => ({
      success: (m: string) => show('success', m),
      error: (m: string) => show('error', m),
      info: (m: string) => show('info', m),
    }),
    [show],
  );
}
