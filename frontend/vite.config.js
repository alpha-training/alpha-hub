import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/live": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/live/, ""),
      },
      "/feedback": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/feedback/, ""),
      },
    },
  },
});
