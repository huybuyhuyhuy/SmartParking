import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/ioc-dashboard/",
  server: { port: 5175, strictPort: true }
});

