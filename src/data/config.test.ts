import { describe, expect, it } from 'vitest';
import { DEFAULT_FIREBASE_CONFIG, DEMO_PROJECT_ID, parseFirebaseConfig } from './config';

describe('parseFirebaseConfig', () => {
  it('falls back to default project credentials in production without env vars', () => {
    const config = parseFirebaseConfig({}, false);
    expect(config.useEmulators).toBe(false);
    expect(config.options.projectId).toBe(DEFAULT_FIREBASE_CONFIG.projectId);
    expect(config.options.apiKey).toBe(DEFAULT_FIREBASE_CONFIG.apiKey);
  });

  it('uses custom Cloud Firebase config when provided', () => {
    const config = parseFirebaseConfig(
      {
        VITE_FIREBASE_API_KEY: 'AIzaSyCustomKey',
        VITE_FIREBASE_AUTH_DOMAIN: 'my-custom-app.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'my-custom-app',
        VITE_FIREBASE_APP_ID: '1:123:web:abc',
      },
      false,
    );
    expect(config.useEmulators).toBe(false);
    expect(config.options.apiKey).toBe('AIzaSyCustomKey');
    expect(config.options.projectId).toBe('my-custom-app');
    expect(config.options.authDomain).toBe('my-custom-app.firebaseapp.com');
  });

  it('respects explicit VITE_USE_EMULATORS=true', () => {
    const config = parseFirebaseConfig(
      {
        VITE_USE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: DEMO_PROJECT_ID,
      },
      false,
    );
    expect(config.useEmulators).toBe(true);
    expect(config.options.projectId).toBe(DEMO_PROJECT_ID);
    expect(config.options.apiKey).toBe('demo-api-key');
  });
});
