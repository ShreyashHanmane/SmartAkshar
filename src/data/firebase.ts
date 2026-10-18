import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { type Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { type FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { parseFirebaseConfig } from './config';

/**
 * The single entry point to Firebase. UI code must not import firebase/* directly
 * (enforced by ESLint); feature data modules in src/data build on these clients.
 * Initialization is lazy so screens that do not need Firebase never load it.
 */
interface Clients {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let clients: Clients | undefined;

export function getFirebase(): Clients {
  if (clients) return clients;

  const config = parseFirebaseConfig(import.meta.env, import.meta.env.DEV);
  const app = initializeApp(config.options);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (config.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  clients = { app, auth, db, storage };
  return clients;
}
