import { type Settings, settingsSchema } from '../shared/schemas';
import { getJson, send } from './api';
import { live } from './events';

export function subscribeSettings(_uid: string, next: (s: Settings) => void, fail: (e: unknown) => void) {
  return live(() => getJson('/api/settings', settingsSchema), ['settings'], next, fail);
}

export async function saveSettings(_uid: string, patch: Partial<Settings>): Promise<void> {
  const body = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await send('PATCH', '/api/settings', body);
}
