import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';
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

describe('everything else', () => {
  it('denies unknown collections and paths outside /users/{uid}', async () => {
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'public/x')));
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/notebooks/n1'), { title: 'x' }));
  });
});

describe('storage rules', () => {
  it('blocks all uploads until upload limits are defined', async () => {
    const storage = env.authenticatedContext('alice').storage();
    await assertFails(uploadString(ref(storage, 'users/alice/books/a.txt'), 'hello'));
  });

  it('lets the owner read their own files but nobody else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), 'users/alice/books/a.txt'), 'hello');
    });
    await assertSucceeds(
      getBytes(ref(env.authenticatedContext('alice').storage(), 'users/alice/books/a.txt')),
    );
    await assertFails(getBytes(ref(env.authenticatedContext('bob').storage(), 'users/alice/books/a.txt')));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'users/alice/books/a.txt')));
  });
});
