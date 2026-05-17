import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        runtimeCaching: [
          // Cache OSM/OpenStreetMap map tiles — static, rarely change
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreVary: true }
            }
          },
          // Cache parking lot API responses — network first, fallback to cache
          {
            urlPattern: /^.*\/api\/parking-lots.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-parking",
              expiration: { maxAgeSeconds: 5 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Cache restricted zones API
          {
            urlPattern: /^.*\/api\/restricted-zones.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-zones",
              expiration: { maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Cache nearby API
          {
            urlPattern: /^.*\/api\/nearby.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-nearby",
              expiration: { maxAgeSeconds: 2 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Cache QR code images
          {
            urlPattern: /^https:\/\/api\.qrserver\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "qr-images",
              expiration: { maxEntries: 50, maxAgeSeconds: 4 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      manifest: {
        name: "Smart Parking Hue",
        short_name: "Parking Hue",
        description: "Find and book parking spots in Hue City — offline capable",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/user-map/",
        scope: "/user-map/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  base: "/user-map/",
  server: { port: 5173, strictPort: true }
});
