import { defineConfig } from 'vite';
import { fluxPlugin } from '@flux/cli';

export default defineConfig({
  plugins: [
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
