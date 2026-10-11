import { defineConfig } from "vite";

// The project site is https://gundam-wing.github.io/webmcp/.
// The Pages workflow sets GITHUB_PAGES=true. Local dev and the e2e build stay at /.
const base = process.env.GITHUB_PAGES === "true" ? "/webmcp/" : "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
