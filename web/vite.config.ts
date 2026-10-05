import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages serves the site from https://medtahiri.github.io/BMO/
export default defineConfig(({ command, isPreview }) => ({
  // build + `vite preview` mirror Pages; `npm run dev` stays at /
  base: command === 'build' || isPreview ? '/BMO/' : '/',
  plugins: [react()],
  // three.js is lazy-loaded in its own chunk; it is legitimately ~1 MB minified (≈275 KB gzip)
  build: { chunkSizeWarningLimit: 1200 },
}))
