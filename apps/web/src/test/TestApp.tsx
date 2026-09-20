import { DEFAULT_ROUTE_PATH } from '@ai-ad-copilot/shared';
import type { ReactElement } from 'react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

import { routes } from '../router/routes';

/**
 * Day1 用声明式路由渲染做断言：
 * react-router 7 的数据路由在 jsdom 下会创建 Request，而 jsdom 的 AbortSignal
 * 与 Node undici 的 Request 不属于同一 realm，会抛 AbortSignal 类型错误。
 * Day2+ 引入 loader/action 时再切回数据路由并补环境适配。
 */
function AppRoutes(): ReactElement | null {
  return useRoutes(routes);
}

export interface TestAppProps {
  initialPath?: string;
}

export function TestApp({ initialPath = DEFAULT_ROUTE_PATH }: TestAppProps) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <AppRoutes />
    </MemoryRouter>
  );
}
