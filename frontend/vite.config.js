import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Identifies this build. The app compares it with /version.json to spot a newer deploy.
// COMMIT_REF is set by Netlify; fall back to the build time locally.
const BUILD_ID = process.env.COMMIT_REF || String(Date.now());

// Writes dist/version.json alongside the app
const versionFile = {
  name: "version-file",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
};

export default defineConfig({
  plugins: [react(), versionFile],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
  },
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
