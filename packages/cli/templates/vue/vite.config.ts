import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fluxPlugin } from '@fluxmesh/cli';

export default defineConfig({
  plugins: [
    vue(),
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
