import { defineConfig } from 'vitest/config';

// Security-rules tests. Run only through `npm run test:rules`,
// which starts the Firestore and Storage emulators first.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
