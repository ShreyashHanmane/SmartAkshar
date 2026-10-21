import { z } from 'zod';

/** Default public client configuration for project akshar-study. */
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC6g0EfYCc0InJcAHC6WHmkV09auQlIAsw',
  authDomain: 'akshar-study.firebaseapp.com',
  projectId: 'akshar-study',
  storageBucket: 'akshar-study.firebasestorage.app',
  appId: '1:457903052317:web:a62d755e898bba4a8098f4',
};

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
 * Validates the public Firebase web config from VITE_ env vars, falling back
 * to the project's real public web credentials so Vercel builds never default
 * to an invalid "demo-api-key" against Google's servers.
 */
export function parseFirebaseConfig(env: Record<string, unknown>, isDev: boolean): FirebaseClientConfig {
  const result = envSchema.safeParse(env);
  const data = result.success ? result.data : {};
  const explicitEmulators = data.VITE_USE_EMULATORS === 'true';

  if (explicitEmulators || (data.VITE_FIREBASE_PROJECT_ID === DEMO_PROJECT_ID && isDev)) {
    const id = data.VITE_FIREBASE_PROJECT_ID || DEMO_PROJECT_ID;
    return {
      useEmulators: true,
      options: {
        apiKey: data.VITE_FIREBASE_API_KEY || 'demo-api-key',
        authDomain: data.VITE_FIREBASE_AUTH_DOMAIN || `${id}.firebaseapp.com`,
        projectId: id,
        storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET || `${id}.appspot.com`,
        appId: data.VITE_FIREBASE_APP_ID || 'demo-app-id',
      },
    };
  }

  const apiKey = data.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey;
  const projectId = data.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId;

  return {
    useEmulators: false,
    options: {
      apiKey,
      authDomain: data.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: data.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
      appId: data.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    },
  };
}
