import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    sourcemap: false,     // Prevents exposing source code in production
    outDir: "dist",       // Default but explicit
  },
});
