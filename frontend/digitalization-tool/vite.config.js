import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/digitalization-tool/",
  server: { port: 5174, strictPort: true }
});

