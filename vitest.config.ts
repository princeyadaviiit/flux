import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@flux/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@flux/vue': path.resolve(__dirname, './packages/vue/src/index.ts'),
      '@flux/svelte': path.resolve(__dirname, './packages/svelte/src/index.ts'),
      '@flux/solid': path.resolve(__dirname, './packages/solid/src/index.ts'),
      '@flux/react': path.resolve(__dirname, './packages/react/src/index.ts'),
      '@flux/cli': path.resolve(__dirname, './packages/cli/src/index.ts'),
    },
  },
});
