import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/user-map/",
  server: { port: 5173, strictPort: true }
});

