import { useCallback, useEffect, useRef, useState } from 'react';
import { authErrorCode } from '../../data/auth';
import { type MessageKey, t } from '../../i18n/i18n';
import { authErrorMessage } from './errors';

type Context = Parameters<typeof authErrorMessage>[1];

/** Runs one auth action at a time, tracking which one is busy and the friendly error. */
export function useAuthAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (id: string, context: Context, action: () => Promise<void>): Promise<boolean> => {
      setBusy(id);
      setError(null);
      try {
        await action();
        return true;
      } catch (err) {
        const key: MessageKey | null = authErrorMessage(authErrorCode(err), context);
        if (mounted.current && key) setError(t(key));
        if (import.meta.env.DEV) console.warn('auth action failed', authErrorCode(err));
        return false;
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [],
  );

  return { busy, error, setError, run };
}
