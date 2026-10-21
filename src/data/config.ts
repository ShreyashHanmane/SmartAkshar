import { z } from 'zod';

/** Emulator-only project id. A `demo-` project can never reach real Firebase resources. */
export const DEMO_PROJECT_ID = 'demo-akshar';

const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().trim().min(1).optional(),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().trim().min(1).optional(),
  VITE_FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  VITE_FIREBASE_APP_ID: z.string().trim().min(1).optional(),
  VITE_USE_EMULATORS: z.string().trim().optional(),
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
 * Validates the public Firebase web config from VITE_ env vars without ever
 * crashing the app with an uncaught ZodError post-deployment.
 */
export function parseFirebaseConfig(env: Record<string, unknown>, isDev: boolean): FirebaseClientConfig {
  const result = envSchema.safeParse(env);
  const data = result.success ? result.data : {};
  const explicitEmulators = data.VITE_USE_EMULATORS === 'true';

  const apiKey = data.VITE_FIREBASE_API_KEY;
  const projectId = data.VITE_FIREBASE_PROJECT_ID;

  const hasRealConfig = Boolean(
    apiKey &&
    projectId &&
    projectId !== DEMO_PROJECT_ID &&
    apiKey !== 'demo-api-key'
  );

  const useEmulators = explicitEmulators || (!hasRealConfig && isDev);

  if (useEmulators || !hasRealConfig || !apiKey || !projectId) {
    const id = projectId || DEMO_PROJECT_ID;
    return {
      useEmulators,
      options: {
        apiKey: apiKey || 'demo-api-key',
        authDomain: data.VITE_FIREBASE_AUTH_DOMAIN || `${id}.firebaseapp.com`,
        projectId: id,
        storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET || `${id}.appspot.com`,
        appId: data.VITE_FIREBASE_APP_ID || 'demo-app-id',
      },
    };
  }

  return {
    useEmulators: false,
    options: {
      apiKey,
      authDomain: data.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      appId: data.VITE_FIREBASE_APP_ID || `${projectId}-app`,
    },
  };
}
