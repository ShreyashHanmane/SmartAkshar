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
 * In emulator mode, missing values fall back to the demo project.
 * Outside emulator mode every value is required.
 */
export function parseFirebaseConfig(env: Record<string, unknown>, isDev: boolean): FirebaseClientConfig {
  const parsed = envSchema.parse(env);
  const useEmulators = parsed.VITE_USE_EMULATORS ? parsed.VITE_USE_EMULATORS === 'true' : isDev;

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
      VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
      VITE_FIREBASE_APP_ID: z.string().min(1),
    })
    .parse(parsed);

  return {
    useEmulators,
    options: {
      apiKey: required.VITE_FIREBASE_API_KEY,
      authDomain: required.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: required.VITE_FIREBASE_PROJECT_ID,
      storageBucket: required.VITE_FIREBASE_STORAGE_BUCKET,
      appId: required.VITE_FIREBASE_APP_ID,
    },
  };
}
