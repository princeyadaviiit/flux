import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@flux/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@flux/vue': path.resolve(__dirname, '../vue/src/index.ts'),
      '@flux/svelte': path.resolve(__dirname, '../svelte/src/index.ts'),
      '@flux/solid': path.resolve(__dirname, '../solid/src/index.ts'),
      '@flux/react': path.resolve(__dirname, '../react/src/index.ts'),
      '@flux/cli': path.resolve(__dirname, '../cli/src/index.ts'),
    },
  },
});
