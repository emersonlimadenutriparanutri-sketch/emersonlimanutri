import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { host: "0.0.0.0", port: 8080 },
  build: {
    rollupOptions: {
      output: {
        // Separa as bibliotecas pesadas para o primeiro carregamento ficar leve.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          graficos: ["recharts"],
          pdf: ["jspdf"],
        },
      },
    },
  },
});
