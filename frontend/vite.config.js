import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = process.env.BACKEND_URL || 'http://127.0.0.1:5050'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is about 500 kB, loaded lazily after the page shell
    chunkSizeWarningLimit: 650,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      // Object form keeps the Host header, which the WebSocket origin check compares against
      '/ws': { target, ws: true },
      '/export': { target },
      '/health': { target },
    },
  },
})
