import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/booking/",
  server: { port: 5176, strictPort: true }
});
