import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { parseFirebaseConfig } from './config';

/**
 * The single entry point to Firebase. UI code must not import firebase/* directly
 * (enforced by ESLint); feature data modules in src/data build on these clients.
 * Initialization is lazy so screens that do not need Firebase never load it.
 */
interface Clients {
  app: FirebaseApp;
  auth: Auth;
}

let clients: Clients | undefined;

export function getFirebase(): Clients {
  if (clients) return clients;

  const config = parseFirebaseConfig(import.meta.env, import.meta.env.DEV);
  const existing = getApps();
  const app = existing.length > 0 && existing[0] ? existing[0] : initializeApp(config.options);
  const auth = getAuth(app);

  if (config.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }

  clients = { app, auth };
  return clients;
}
