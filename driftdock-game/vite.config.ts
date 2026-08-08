import { defineConfig } from "vite";
export default defineConfig({
  base: "/driftdock/",
  build: { outDir: "../driftdock", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 3000 },
});
