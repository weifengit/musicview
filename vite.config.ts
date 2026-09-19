import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Tauri 打包要求相对路径资源
  base: './',
  server: {
    port: 5173,
  },
});
