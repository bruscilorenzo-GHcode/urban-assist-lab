import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function buildVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '.')
    return hash ? `${hash}-${stamp}` : 'dev'
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion()),
  },
  server: { port: 5180, host: true },
  preview: { port: 5180, host: true },
  build: { chunkSizeWarningLimit: 1000 },
})
