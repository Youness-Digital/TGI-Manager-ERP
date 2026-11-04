import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo.png.jpeg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "TGI Manager",
        short_name: "TGI",
        description: "ERP de gestion pour TGI Ascenseurs",
        theme_color: "#1e40af",
        background_color: "#f5f7fb",
        display: "standalone",
        orientation: "any",
        lang: "fr",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@firebase/firestore/")) {
            return "firebase-firestore";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "lucide";
          }
        },
      },
    },
  },
});
