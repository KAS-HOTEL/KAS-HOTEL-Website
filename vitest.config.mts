import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Form tests render whole screens; 5 s timed out when the machine was busy
    // (e.g. Maven running alongside). A real hang still fails, just later.
    testTimeout: 15000,
  },
});
