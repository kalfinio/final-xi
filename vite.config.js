import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the build works at any path (root domain or subfolder),
  // e.g. Vercel/Netlify root or GitHub Pages project subpath. Safe here because
  // Final XI is a single page with no client-side router.
  base: './',
  plugins: [react()],
})
