import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web', import.meta.url)), '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  // Element Plus forms and tables share one vendor chunk. It is served locally on the LAN,
  // so 1.2 MB is an appropriate warning threshold while route views remain lazy-loaded.
  build: { outDir: '../dist/public', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
})
