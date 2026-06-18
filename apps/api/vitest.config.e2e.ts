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
    // E2e specs share one Postgres and open operações; `getCurrentRowOrThrow`
    // resolves the first OPEN session, so two specs running at once cross-bind
    // accounts to each other's session (breaking cleanups via FK). Run serially.
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
