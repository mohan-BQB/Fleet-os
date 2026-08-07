import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api and /admin to Django so the browser only ever talks to one
// origin (localhost:5173) - that's what makes session cookies + CSRF work
// without needing CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Port 8000 is a separate checkout's backend (a different Django
      // process on this machine, see /Users/mohan/Documents/Truck without
      // the "2") - this checkout's own backend runs on 8001 to avoid
      // colliding with it.
      '/api': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      '/admin': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
})
