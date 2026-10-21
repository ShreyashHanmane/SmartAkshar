import { DEFAULT_SETTINGS, type Settings, settingsSchema } from '../shared/schemas';
import { getJson, send } from './api';
import { live } from './events';

const SETTINGS_KEY = 'akshar:settings';

export function subscribeSettings(_uid: string, next: (s: Settings) => void, fail: (e: unknown) => void) {
  return live(
    async () => {
      try {
        const res = await getJson('/api/settings', settingsSchema);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(res));
        }
        return res;
      } catch {
        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem(SETTINGS_KEY);
          if (raw) {
            try {
              return settingsSchema.parse(JSON.parse(raw));
            } catch {
              // ignore
            }
          }
        }
        return DEFAULT_SETTINGS;
      }
    },
    ['settings'],
    next,
    fail,
  );
}

export async function saveSettings(_uid: string, patch: Partial<Settings>): Promise<void> {
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const current = raw ? (JSON.parse(raw) as Settings) : DEFAULT_SETTINGS;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  }
  try {
    const body = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await send('PATCH', '/api/settings', body);
  } catch {
    // Expected on static deployments without a running local server
  }
}
