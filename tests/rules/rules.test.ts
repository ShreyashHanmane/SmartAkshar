import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, uploadString } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-akshar',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();
const subject = (patch: Record<string, unknown> = {}) => ({
  name: 'Physics',
  color: 'blue',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...patch,
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

describe('profile document', () => {
  it('lets the owner save valid settings', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice'), {
        settings: { theme: 'paper', textSize: 'lg' },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });

  it('rejects unknown settings values and extra fields', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), { settings: { theme: 'neon' }, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), {
        settings: { theme: 'dark', isAdmin: true },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(setDoc(doc(alice(), 'users/alice'), { role: 'admin', updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), {
        settings: { theme: 'dark' },
        updatedAt: Timestamp.fromMillis(0),
      }),
    );
  });

  it('denies other users and signed-out visitors', async () => {
    await seed('users/alice', { settings: { theme: 'dark' }, updatedAt: Timestamp.now() });
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(setDoc(doc(bob(), 'users/alice'), { settings: {}, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
});

describe('subjects', () => {
  it('lets the owner create, rename, and delete', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/subjects/s1'), subject()));
    await assertSucceeds(
      updateDoc(doc(alice(), 'users/alice/subjects/s1'), { name: 'Maths', updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/subjects/s1')));
  });

  it('validates name length, color, and fields', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/subjects/s1'), subject({ name: '' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/subjects/s1'), subject({ name: 'x'.repeat(41) })));
    await assertFails(setDoc(doc(alice(), 'users/alice/subjects/s1'), subject({ color: '#ff0000' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/subjects/s1'), subject({ extra: 1 })));
  });

  it('keeps createdAt fixed on update', async () => {
    await seed('users/alice/subjects/s1', {
      name: 'P',
      color: 'blue',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await assertFails(
      updateDoc(doc(alice(), 'users/alice/subjects/s1'), {
        createdAt: Timestamp.fromMillis(0),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("denies another student's subjects", async () => {
    await seed('users/alice/subjects/s1', {
      name: 'P',
      color: 'blue',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await assertFails(getDoc(doc(bob(), 'users/alice/subjects/s1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/subjects/s2'), subject()));
    await assertFails(deleteDoc(doc(bob(), 'users/alice/subjects/s1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/subjects/s1')));
  });
});

const notebook = (patch: Record<string, unknown> = {}) => ({
  title: 'Classical Mechanics',
  subjectId: null,
  mode: 'paged',
  paper: 'dots',
  background: 'white',
  pageCount: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...patch,
});

describe('notebooks and pages', () => {
  it('lets the owner create a notebook with its first page in one batch', async () => {
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/alice/notebooks/n1'), notebook());
    batch.set(doc(db, 'users/alice/notebooks/n1/pages/p0'), {
      index: 0,
      elements: [],
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice/notebooks/n1'), { mode: 'infinite', updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/notebooks/n1/pages/p0')));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/notebooks/n1')));
  });

  it('validates notebook fields', async () => {
    const ref = doc(alice(), 'users/alice/notebooks/n1');
    await assertFails(setDoc(ref, notebook({ title: '' })));
    await assertFails(setDoc(ref, notebook({ title: 'x'.repeat(121) })));
    await assertFails(setDoc(ref, notebook({ mode: 'spiral' })));
    await assertFails(setDoc(ref, notebook({ paper: 'music' })));
    await assertFails(setDoc(ref, notebook({ pageCount: 0 })));
    await assertFails(setDoc(ref, notebook({ pageCount: 1.5 })));
    await assertFails(setDoc(ref, notebook({ owner: 'bob' })));
  });

  it('validates pages', async () => {
    const ref = (id: string) => doc(alice(), `users/alice/notebooks/n1/pages/${id}`);
    await assertSucceeds(
      setDoc(ref('p1'), { index: 1, elements: [{ k: 's' }], updatedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(ref('p2'), { index: -1, elements: [], updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref('p3'), { index: 3, elements: 'x', updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(ref('p4'), { index: 4, elements: [], extra: true, updatedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(ref('bad id!'), { index: 5, elements: [], updatedAt: serverTimestamp() }));
  });

  it("denies another student's notebooks and pages", async () => {
    await seed('users/alice/notebooks/n1', { title: 'x' });
    await seed('users/alice/notebooks/n1/pages/p0', { index: 0, elements: [] });
    await assertFails(getDoc(doc(bob(), 'users/alice/notebooks/n1')));
    await assertFails(getDoc(doc(bob(), 'users/alice/notebooks/n1/pages/p0')));
    await assertFails(
      setDoc(doc(bob(), 'users/alice/notebooks/n1/pages/p0'), {
        index: 0,
        elements: [],
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(bob(), 'users/alice/notebooks/n1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/notebooks/n1')));
  });
});

describe('study activity', () => {
  const day = 'users/alice/activity/2026-10-18';

  it('accepts small increments only', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), day), { seconds: increment(60), updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), day), { seconds: increment(60), updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertFails(
      setDoc(doc(alice(), day), { seconds: increment(5000), updatedAt: serverTimestamp() }, { merge: true }),
    );
    await assertFails(
      setDoc(doc(alice(), day), { seconds: 10, updatedAt: serverTimestamp() }, { merge: true }),
    );
  });

  it('rejects bad day ids and other users', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/activity/today'), { seconds: 60, updatedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(doc(bob(), day), { seconds: 60, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(bob(), day)));
  });
});

describe('everything else', () => {
  it('denies unknown collections and paths outside /users/{uid}', async () => {
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'public/x')));
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/cards/c1'), { front: 'x' }));
  });
});

describe('notes', () => {
  it('allows only the main note with content and a server timestamp', async () => {
    const db = alice();
    await assertSucceeds(
      setDoc(doc(db, 'users/alice/notebooks/n1/notes/main'), {
        content: { type: 'doc' },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/notebooks/n1/notes/other'), { content: {}, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/notebooks/n1/notes/main'), {
        content: 'html',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, 'users/alice/notebooks/n1/notes/main'), {
        content: {},
        html: '<b>',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(bob(), 'users/alice/notebooks/n1/notes/main')));
  });
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const name = 'a'.repeat(32);

describe('storage rules', () => {
  it('lets the owner upload valid note images within limits', async () => {
    const storage = env
      .authenticatedContext('alice', { firebase: { sign_in_provider: 'password' } })
      .storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `users/alice/notes/n1/${name}.png`), png, { contentType: 'image/png' }),
    );
    await assertSucceeds(getBytes(ref(storage, `users/alice/notes/n1/${name}.png`)));
    await assertSucceeds(deleteObject(ref(storage, `users/alice/notes/n1/${name}.png`)));
  });

  it('rejects wrong types, names, sizes, overwrites, and other users', async () => {
    const storage = env
      .authenticatedContext('alice', { firebase: { sign_in_provider: 'password' } })
      .storage();
    await assertFails(
      uploadBytes(ref(storage, `users/alice/notes/n1/${name}.svg`), png, { contentType: 'image/svg+xml' }),
    );
    await assertFails(
      uploadBytes(ref(storage, `users/alice/notes/n1/${name}.png`), png, { contentType: 'text/html' }),
    );
    await assertFails(
      uploadBytes(ref(storage, 'users/alice/notes/n1/my photo.png'), png, { contentType: 'image/png' }),
    );
    await assertFails(
      uploadBytes(ref(storage, `users/alice/notes/n1/${name}.png`), new Uint8Array(5 * 1024 * 1024 + 1), {
        contentType: 'image/png',
      }),
    );
    await assertSucceeds(
      uploadBytes(ref(storage, `users/alice/notes/n1/${'b'.repeat(32)}.png`), png, {
        contentType: 'image/png',
      }),
    );
    await assertFails(
      uploadBytes(ref(storage, `users/alice/notes/n1/${'b'.repeat(32)}.png`), png, {
        contentType: 'image/png',
      }),
    );
    const bobStorage = env.authenticatedContext('bob').storage();
    await assertFails(
      uploadBytes(ref(bobStorage, `users/alice/notes/n1/${'c'.repeat(32)}.png`), png, {
        contentType: 'image/png',
      }),
    );
    await assertFails(getBytes(ref(bobStorage, `users/alice/notes/n1/${'b'.repeat(32)}.png`)));
    await assertFails(
      getBytes(ref(env.unauthenticatedContext().storage(), `users/alice/notes/n1/${'b'.repeat(32)}.png`)),
    );
  });

  it('gives guests a smaller image limit', async () => {
    const guest = env.authenticatedContext('gina', { firebase: { sign_in_provider: 'anonymous' } }).storage();
    await assertFails(
      uploadBytes(ref(guest, `users/gina/notes/n1/${name}.png`), new Uint8Array(2 * 1024 * 1024 + 1), {
        contentType: 'image/png',
      }),
    );
    await assertSucceeds(
      uploadBytes(ref(guest, `users/gina/notes/n1/${name}.png`), png, { contentType: 'image/png' }),
    );
  });

  it('keeps other folders read-only for the owner', async () => {
    const storage = env.authenticatedContext('alice').storage();
    await assertFails(uploadString(ref(storage, 'users/alice/books/a.txt'), 'hello'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), 'users/alice/books/a.txt'), 'hello');
    });
    await assertSucceeds(getBytes(ref(storage, 'users/alice/books/a.txt')));
    await assertFails(getBytes(ref(env.authenticatedContext('bob').storage(), 'users/alice/books/a.txt')));
  });
});
