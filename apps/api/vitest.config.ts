import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc plugin so vitest emits decorator metadata that Nest DI relies on.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: '.',
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
