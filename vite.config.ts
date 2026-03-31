import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => {
  // Conditionally load rollup-plugin-visualizer when ANALYZE=true
  const visualizerPlugin =
    process.env.ANALYZE === "true"
      ? [
          (await import("rollup-plugin-visualizer")).visualizer({
            open: true,
            filename: "dist/bundle-stats.html",
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : [];

  return {
  plugins: [react(), tailwindcss(), ...visualizerPlugin],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: {
      deny: ["src-tauri/target"],
    },
  },
  optimizeDeps: {
    entries: ["src/main.tsx"],
  },
};
});
