import { defineConfig } from 'vitest/config';

// API tests: each test file starts the local server with a throwaway data folder.
export default defineConfig({
  test: {
    include: ['tests/server/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
