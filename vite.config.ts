import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from https://<user>.github.io/<repo>/
  // Set VITE_BASE in CI to "/<repo>/" so asset URLs resolve correctly.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
