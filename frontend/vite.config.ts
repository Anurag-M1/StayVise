import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('axios') || id.includes('@tanstack/react-query') || id.includes('zustand') || id.includes('date-fns')) return 'vendor-utils';
            if (id.includes('recharts') || id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts';
            if (id.includes('jspdf')) return 'vendor-docs';
            if (id.includes('@sentry/react')) return 'vendor-sentry';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false, // Speeds up builds
  },
})
