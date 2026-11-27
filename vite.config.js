import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// One site, many apps. Each app lives in its own folder with its own
// index.html + web manifest, so "Add to Home Screen" shows that app's icon.
// To add a new app: create /<app>/index.html and public/apps/<app>/ (manifest + icons),
// then add it to `input` below.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // when this version was built (shown in Profile → Resync app)
  define: { __SPLITSY_BUILD__: JSON.stringify(new Date().toISOString()) },
  build: {
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'index.html'),
        splitsy: resolve(__dirname, 'splitsy/index.html'),
      },
      output: {
        manualChunks: {
          tf: ['@tensorflow/tfjs', '@tensorflow-models/mobilenet'],
          ocr: ['tesseract.js'],
        },
      },
    },
  },
})
