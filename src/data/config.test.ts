import { describe, expect, it } from 'vitest';
import { DEMO_PROJECT_ID, parseFirebaseConfig } from './config';

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'p.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_STORAGE_BUCKET: 'p.appspot.com',
  VITE_FIREBASE_APP_ID: 'a',
};

describe('parseFirebaseConfig', () => {
  it('uses the demo project for emulators in development', () => {
    const config = parseFirebaseConfig({}, true);
    expect(config.useEmulators).toBe(true);
    expect(config.options.projectId).toBe(DEMO_PROJECT_ID);
  });

  it('requires every value in production', () => {
    expect(() => parseFirebaseConfig({}, false)).toThrow();
    expect(() => parseFirebaseConfig({ ...full, VITE_FIREBASE_APP_ID: '' }, false)).toThrow();
  });

  it('accepts a complete production config without emulators', () => {
    const config = parseFirebaseConfig(full, false);
    expect(config.useEmulators).toBe(false);
    expect(config.options.projectId).toBe('p');
  });

  it('lets VITE_USE_EMULATORS=false override development mode', () => {
    expect(parseFirebaseConfig({ ...full, VITE_USE_EMULATORS: 'false' }, true).useEmulators).toBe(false);
  });

  it('rejects malformed flags', () => {
    expect(() => parseFirebaseConfig({ VITE_USE_EMULATORS: 'yes' }, true)).toThrow();
  });
});
