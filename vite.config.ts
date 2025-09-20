import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = process.env.PUBLIC_BASE || '/'
  return {
    base,
    plugins: [react(), tailwind()],
    optimizeDeps: { force: true },
  }
})
