import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@fluxmesh/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
      '@flux/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
    },
  },
});
