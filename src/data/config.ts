import { z } from 'zod';

/** Emulator-only project id. A `demo-` project can never reach real Firebase resources. */
export const DEMO_PROJECT_ID = 'demo-akshar';

const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1).optional(),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  VITE_FIREBASE_APP_ID: z.string().min(1).optional(),
  VITE_USE_EMULATORS: z.enum(['true', 'false']).optional(),
});

export interface FirebaseClientConfig {
  useEmulators: boolean;
  options: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    appId: string;
  };
}

/**
 * Validates the public Firebase web config from VITE_ env vars.
 * In emulator mode or when running locally without cloud credentials,
 * it falls back safely to demo values.
 * When real cloud credentials are provided, connects to real cloud Firebase.
 */
export function parseFirebaseConfig(env: Record<string, unknown>, isDev: boolean): FirebaseClientConfig {
  const parsed = envSchema.parse(env);
  const explicitEmulators = parsed.VITE_USE_EMULATORS === 'true';
  const hasRealConfig = Boolean(
    parsed.VITE_FIREBASE_API_KEY &&
    parsed.VITE_FIREBASE_PROJECT_ID &&
    parsed.VITE_FIREBASE_PROJECT_ID !== DEMO_PROJECT_ID
  );

  const useEmulators = explicitEmulators || (!hasRealConfig && isDev);

  if (useEmulators) {
    const projectId = parsed.VITE_FIREBASE_PROJECT_ID ?? DEMO_PROJECT_ID;
    return {
      useEmulators,
      options: {
        apiKey: parsed.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
        authDomain: parsed.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
        projectId,
        storageBucket: parsed.VITE_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
        appId: parsed.VITE_FIREBASE_APP_ID ?? 'demo-app-id',
      },
    };
  }

  const required = z
    .object({
      VITE_FIREBASE_API_KEY: z.string().min(1),
      VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
      VITE_FIREBASE_PROJECT_ID: z.string().min(1),
      VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
      VITE_FIREBASE_APP_ID: z.string().min(1),
    })
    .parse(parsed);

  return {
    useEmulators: false,
    options: {
      apiKey: required.VITE_FIREBASE_API_KEY,
      authDomain: required.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: required.VITE_FIREBASE_PROJECT_ID,
      storageBucket: required.VITE_FIREBASE_STORAGE_BUCKET ?? `${required.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
      appId: required.VITE_FIREBASE_APP_ID,
    },
  };
}

