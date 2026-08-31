import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { fluxPlugin } from '@flux/cli';

export default defineConfig({
  plugins: [
    solidPlugin(),
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
