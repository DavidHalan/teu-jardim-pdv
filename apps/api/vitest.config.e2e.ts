import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    root: '.',
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
