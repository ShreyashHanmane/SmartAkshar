import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LOCAL_KEY_PREFIX } from '../../data/auth';
import { DEFAULT_SETTINGS, type Settings } from '../../data/models';
import { saveSettings, subscribeSettings } from '../../data/profile';
import { useLive } from '../../data/useLive';
import { t } from '../../i18n/i18n';
import { applyAppearance } from '../../theme/appearance';
import { useToast } from '../../ui/Toast';
import { useSession } from '../session/SessionProvider';

export const APPEARANCE_CACHE_KEY = `${LOCAL_KEY_PREFIX}appearance`;

interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: () => undefined });

/**
 * Loads the signed-in user's saved settings and applies theme + text size.
 * Changes apply instantly (optimistic) and are saved to Firestore; the last
 * appearance is cached locally so the next page load paints in the right theme.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const toast = useToast();
  const uid = session.status === 'signedIn' ? session.user.uid : null;
  const live = useLive<Settings>(uid, (next, fail) =>
    uid ? subscribeSettings(uid, next, fail) : () => undefined,
  );
  const [pending, setPending] = useState<Partial<Settings>>({});

  const settings = useMemo<Settings>(
    () => ({ ...(live.status === 'ready' ? live.data : DEFAULT_SETTINGS), ...pending }),
    [live, pending],
  );

  useEffect(() => {
    if (live.status !== 'ready' && Object.keys(pending).length === 0) return;
    const appearance = { theme: settings.theme, textSize: settings.textSize };
    applyAppearance(document.documentElement, appearance);
    try {
      localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(appearance));
    } catch {
      // Storage may be unavailable (private mode); the saved setting still applies.
    }
  }, [live.status, pending, settings.theme, settings.textSize]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      if (!uid) return;
      const drop = () =>
        setPending(
          (p) =>
            Object.fromEntries(Object.entries(p).filter(([key]) => !(key in patch))) as Partial<Settings>,
        );
      setPending((p) => ({ ...p, ...patch }));
      saveSettings(uid, patch)
        .then(() => toast.success(t('settings.saved')))
        .catch(() => toast.error(t('settings.saveFailed')))
        // On success the live snapshot already holds the value; on failure it reverts.
        .finally(drop);
    },
    [uid, toast],
  );

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
