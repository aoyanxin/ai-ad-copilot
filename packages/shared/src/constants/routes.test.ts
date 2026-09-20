import { describe, expect, it } from 'vitest';

import { DEFAULT_ROUTE_PATH, ROUTE_PATHS } from './routes';

describe('ROUTE_PATHS', () => {
  it('覆盖 Day1 要求的四个功能页', () => {
    expect(Object.keys(ROUTE_PATHS).sort()).toEqual(['copilot', 'dashboard', 'lowcode', 'rag']);
  });

  it('所有路径均为以 / 开头的绝对路径且互不重复', () => {
    const paths = Object.values(ROUTE_PATHS);

    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('默认路由指向 dashboard', () => {
    expect(DEFAULT_ROUTE_PATH).toBe(ROUTE_PATHS.dashboard);
  });
});
