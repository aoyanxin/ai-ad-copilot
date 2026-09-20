import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // shared 是 workspace 链接包，产物为 CommonJS，需显式预构建以完成 ESM 互操作
    include: ['@ai-ad-copilot/shared'],
  },
  build: {
    commonjsOptions: {
      // 默认只对 node_modules 做 CJS 转换，workspace 链接包需要显式加入
      include: [/node_modules/, /packages[\\/]shared[\\/]dist/],
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
