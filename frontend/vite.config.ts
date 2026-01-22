import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/**/*.png",
        "splash/**/*.png",
      ],
      manifest: false, // Sử dụng manifest.json riêng
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 năm
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 ngày
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 phút
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // Ignore URL query parameters for caching
        ignoreURLParametersMatching: [/^fbclid$/, /^gclid$/, /^utm_/],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    // 📈 PERFORMANCE BUDGET: Bundle size analyzer
    visualizer({
      filename: "dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: "treemap", // sunburst, treemap, network
    }),
  ],

  // ✅ ADD PROXY HERE (fix 404 for /push/upload-video)
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Backend FastAPI (đổi port nếu bạn chạy khác)
      "/push": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Serve uploaded files (nếu backend mount /media)
      "/media": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // Nếu project bạn dùng /api cho detect ảnh thì proxy luôn cho đồng bộ
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },

  build: {
    sourcemap: false,
    // 🎯 PERFORMANCE BUDGET: Target < 300KB gzipped
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk: React ecosystem
          vendor: ["react", "react-dom"],
          // Database chunk: IndexedDB
          database: ["dexie"],
          // Utils chunk: HTTP client
          utils: ["axios", "zustand"],
        },
        // 📦 Optimize chunk naming for caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    // ⚡ Performance optimizations
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
  },
});
