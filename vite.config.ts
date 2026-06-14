import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No backend — the app fetches static JSON from public/data/.
// Same build deploys as a static site (local dev + GitHub Pages).
// base: served from a project page at https://tane994.github.io/daily-news/,
// so every asset + data path is prefixed with /daily-news/. In dev it's "/".
// The data fetches in src/lib/api.ts read import.meta.env.BASE_URL to match.
export default defineConfig({
  base: "/daily-news/",
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: "dist" },
});
