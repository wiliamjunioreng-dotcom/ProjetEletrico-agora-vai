import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',   // OBRIGATÓRIO para Electron carregar assets via file://
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
