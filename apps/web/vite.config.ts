import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // O front importa enums do @teu-jardim/shared como VALOR (ex.: Role). O pacote é
  // emitido em CJS (consumido pela API Nest/CJS); o dev server do Vite serve workspace
  // pkgs linkados via /@fs/ sem interop CJS→ESM. Pré-bundlar resolve os named exports.
  optimizeDeps: { include: ['@teu-jardim/shared'] },
  server: {
    port: 5173,
    host: true, // expõe na LAN (acesso por tablet/celular)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
