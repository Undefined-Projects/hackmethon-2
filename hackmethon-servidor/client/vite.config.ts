import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `host: true` expone el dev server en todas las interfaces. Sin esto
  // Vite solo escucha en localhost y desde otro portátil no hay nada que ver.
  // `allowedHosts`: Vite rechaza hosts desconocidos. Los túneles rápidos de
  // cloudflared estrenan subdominio en cada arranque, y por Tailscale se
  // entra con el nombre MagicDNS (`raspi.<tailnet>.ts.net`).
  server: { host: true, port: 5173, strictPort: true, allowedHosts: ['.trycloudflare.com', '.ts.net'] },
  preview: { host: true, port: 4173, strictPort: true, allowedHosts: ['.trycloudflare.com', '.ts.net'] },
});
