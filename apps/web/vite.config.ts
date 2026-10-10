import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  resolve: {
    alias: {
      '@speakready/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  plugins: [
    react({
      // Enable automatic JSX runtime for smaller bundles
      jsxRuntime: 'automatic',
    }),
    tailwindcss(),
    // Compress assets with gzip and brotli for smaller file sizes
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
      deleteOriginFile: false,
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
      deleteOriginFile: false,
    }),
  ],
  server: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-cache',
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    sourcemap: false,
    // Better minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      mangle: {
        safari10: true, // Fix Safari 10 bugs
      },
    },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        // Improved manual chunking strategy
        manualChunks: (id) => {
          // Vendor chunks - split by package for better caching
          if (id.includes('node_modules')) {
            // React ecosystem (loaded on every page)
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react'
            }
            // React Router (loaded on every page)
            if (id.includes('react-router')) {
              return 'vendor-router'
            }
            // Supabase (auth/data - loaded early)
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            // Socket.io (real-time - loaded on demand)
            if (id.includes('socket.io')) {
              return 'vendor-socket'
            }
            // Recharts (visualization - loaded on specific pages)
            if (id.includes('recharts')) {
              return 'vendor-charts'
            }
            // MediaPipe (heavy 15MB+ - only interview room)
            if (id.includes('@mediapipe')) {
              return 'vendor-mediapipe'
            }
            // Other vendors bundled together
            return 'vendor-other'
          }
          // App code chunking by feature
          if (id.includes('/pages/student/')) {
            return 'pages-student'
          }
          if (id.includes('/pages/staff/')) {
            return 'pages-staff'
          }
          if (id.includes('/pages/admin/')) {
            return 'pages-admin'
          }
          if (id.includes('/pages/auth/')) {
            return 'pages-auth'
          }
        },
      },
    },
  },
  // Enable module preload polyfill for faster chunk loading
  modulePreload: {
    polyfill: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
    ],
    exclude: [
      '@mediapipe/tasks-vision', // Don't pre-bundle MediaPipe (too large)
    ],
  },
})
