import { defineConfig } from 'vitest/config';

// Config propia para los tests (independiente de vite.config.ts, que es del
// scaffold abandonado de src/). host fijo a 127.0.0.1 para no depender de que
// "localhost" resuelva (algunas VPN/DNS lo rompen).
export default defineConfig({
  server: { host: '127.0.0.1' },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    api: false,
  },
});
