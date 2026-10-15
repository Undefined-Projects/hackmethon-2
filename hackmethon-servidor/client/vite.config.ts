import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `host: true` expone el dev server en todas las interfaces. Sin esto
  // Vite solo escucha en localhost y desde otro portátil no hay nada que ver.
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
});
