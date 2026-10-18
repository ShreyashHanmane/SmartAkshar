import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
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

describe('firestore rules', () => {
  it('lets a student read and write their own data', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice/notebooks/n1'), { title: 'Physics' }));
    await assertSucceeds(getDoc(doc(db, 'users/alice/notebooks/n1')));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/notebooks/n1')));
  });

  it("denies access to another student's data", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/notebooks/n1'), { title: 'Physics' });
    });
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'users/alice/notebooks/n1')));
    await assertFails(setDoc(doc(bob, 'users/alice/notebooks/n2'), { title: 'x' }));
  });

  it('denies unauthenticated access', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users/alice/notebooks/n1')));
    await assertFails(setDoc(doc(anon, 'users/alice/notebooks/n1'), { title: 'x' }));
  });

  it("lets a student reach their own profile document but not another student's", async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { displayName: 'Alice' }));
    await assertFails(getDoc(doc(db, 'users/bob')));
    await assertFails(setDoc(doc(db, 'users/bob'), { displayName: 'x' }));
  });

  it('denies everything outside /users/{uid}', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'public/x'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'public/x')));
    await assertFails(getDoc(doc(db, 'users-backup/alice')));
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
