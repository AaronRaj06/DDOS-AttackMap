import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = process.env.BACKEND_URL || 'http://127.0.0.1:5050'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    // Express redirects /tour to /tour/ in production; do the same in dev instead of falling back to the dashboard
    name: 'tour-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/tour' && !req.url.startsWith('/tour?')) return next();
        res.writeHead(301, { Location: req.url.replace('/tour', '/tour/') }).end();
      });
    },
  }],
  build: {
    // three.js alone is about 500 kB, loaded lazily after the page shell
    chunkSizeWarningLimit: 650,
    // Two pages: the dashboard at / and the tour at /tour/, both served as static files by Express
    rollupOptions: { input: { main: 'index.html', tour: 'tour/index.html' } },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      // Object form keeps the Host header, which the WebSocket origin check compares against
      '/ws': { target, ws: true },
      '/export': { target },
      '/health': { target },
      // read by the tour
      '/stats': { target },
      '/threats': { target },
      '/timeline': { target },
    },
  },
})
