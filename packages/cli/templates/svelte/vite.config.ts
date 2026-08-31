import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fluxPlugin } from '@fluxmesh/cli';

export default defineConfig({
  plugins: [
    svelte(),
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
