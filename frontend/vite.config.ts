import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api and /admin to Django so the browser only ever talks to one
// origin (localhost:5173) - that's what makes session cookies + CSRF work
// without needing CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/admin': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
