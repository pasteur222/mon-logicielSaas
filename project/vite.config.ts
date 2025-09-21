import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  preview: {
    // Autoriser ce host pour le mode preview
    allowedHosts: ['saasprospector.onrender.com'],
  },
});
