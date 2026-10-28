import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any GitHub Pages path.
// Libraries get their own chunks so they stay cached when only app code changes.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("@tanstack")) return "query";
          return "vendor";
        },
      },
    },
  },
});
