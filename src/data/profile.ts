import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { DEFAULT_SETTINGS, type Settings, settingsSchema } from './models';

function profileRef(uid: string) {
  return doc(getFirebase().db, 'users', uid);
}

export function subscribeSettings(uid: string, next: (s: Settings) => void, fail: (e: unknown) => void) {
  return onSnapshot(
    profileRef(uid),
    (snap) => {
      const raw: unknown = snap.data()?.settings;
      next(raw === undefined ? DEFAULT_SETTINGS : settingsSchema.parse(raw));
    },
    fail,
  );
}

/** Merges settings into the profile document (creates it on first save). */
export async function saveSettings(uid: string, patch: Partial<Settings>): Promise<void> {
  const settings = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await setDoc(profileRef(uid), { settings, updatedAt: serverTimestamp() }, { merge: true });
}
