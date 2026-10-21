import { describe, expect, it } from 'vitest';
import { DEMO_PROJECT_ID, parseFirebaseConfig } from './config';

describe('parseFirebaseConfig', () => {
  it('never throws a Zod error when env vars are missing post-deployment', () => {
    // In production without env vars set yet:
    const config = parseFirebaseConfig({}, false);
    expect(config.useEmulators).toBe(false);
    expect(config.options.projectId).toBe(DEMO_PROJECT_ID);
    expect(config.options.apiKey).toBe('demo-api-key');
  });

  it('uses real Cloud Firebase config when real credentials are provided', () => {
    const config = parseFirebaseConfig(
      {
        VITE_FIREBASE_API_KEY: 'AIzaSy12345',
        VITE_FIREBASE_AUTH_DOMAIN: 'my-app.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'my-app',
        VITE_FIREBASE_APP_ID: '1:123:web:abc',
      },
      false,
    );
    expect(config.useEmulators).toBe(false);
    expect(config.options.apiKey).toBe('AIzaSy12345');
    expect(config.options.projectId).toBe('my-app');
    expect(config.options.authDomain).toBe('my-app.firebaseapp.com');
  });

  it('respects explicit VITE_USE_EMULATORS=true', () => {
    const config = parseFirebaseConfig(
      {
        VITE_USE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: 'custom-demo',
      },
      false,
    );
    expect(config.useEmulators).toBe(true);
    expect(config.options.projectId).toBe('custom-demo');
  });
});
