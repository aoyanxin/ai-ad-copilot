import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 按包名分组拆包：echarts 只在 /dashboard 的异步 chunk 里加载，
 * react / antd / echarts 各自成块，避免出现单个 700KB+ 的巨型入口 chunk。
 */
function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) {
    return undefined;
  }

  const segments = normalized.slice(index + marker.length).split('/');
  const packageName = segments[0].startsWith('@')
    ? `${segments[0]}/${segments[1]}`
    : segments[0];

  // echarts 与 zrender 都是大库，分开成块避免单块过大
  if (packageName === 'echarts') {
    return 'vendor-echarts';
  }
  if (packageName === 'zrender') {
    return 'vendor-zrender';
  }
  if (
    packageName === 'react' ||
    packageName === 'react-dom' ||
    packageName === 'react-router' ||
    packageName === 'react-router-dom' ||
    packageName === 'scheduler'
  ) {
    return 'vendor-react';
  }
  if (packageName === 'dayjs') {
    return 'vendor-dayjs';
  }
  // tslib 被 echarts 与 zrender 同时引用：必须落成独立叶子 chunk，
  // 否则 helper 会跟着 echarts 走，形成 echarts <-> zrender 的循环 chunk，运行时直接报错
  if (packageName === 'tslib') {
    return 'vendor-tslib';
  }

  // 其余依赖交给 Rollup 按引用关系自动切分，避免把库里的小包硬塞进一个大块
  return undefined;
}

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
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
