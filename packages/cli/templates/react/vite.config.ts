import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fluxPlugin } from '@fluxmesh/cli';

export default defineConfig({
  plugins: [
    react(),
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
