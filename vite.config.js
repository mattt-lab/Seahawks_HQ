import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Same GitHub Pages project-page convention as CFB_top25: production builds are served from
  // https://mattt-lab.github.io/Seahawks_HQ/ and need that prefix on every asset URL, or a
  // deployed hard-refresh 404s. Local dev stays at the root.
  base: command === 'build' ? '/Seahawks_HQ/' : '/',
}))
