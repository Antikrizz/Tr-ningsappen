import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relativ base så bygget funkar på GitHub Pages (username.github.io/repo/)
  base: "./",
  server: {
    host: true,
    port: 5173
  }
});
