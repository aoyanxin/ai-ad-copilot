import { DEFAULT_ROUTE_PATH, ROUTE_PATHS, type RoutePath } from '@ai-ad-copilot/shared';
import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

import { PageFallback } from '../components/PageFallback';
import { BasicLayout } from '../layouts/BasicLayout';
import { AiCopilotPage } from '../pages/AiCopilot';
import { LowCodePage } from '../pages/LowCode';
import { NotFoundPage } from '../pages/NotFound';
import { RagPage } from '../pages/Rag';

/**
 * Dashboard 承载 echarts / Table / DatePicker，改为路由级懒加载：
 * 这些依赖只在进入 /dashboard 时下载，首屏入口 chunk 保持轻量。
 */
const DashboardPage = lazy(() =>
  import('../pages/Dashboard').then((module) => ({ default: module.DashboardPage })),
);

/** 父路由为 '/'，子路由必须是相对路径，从 ROUTE_PATHS 派生以避免两处漂移 */
export function toChildPath(path: RoutePath): string {
  return path.replace(/^\//, '');
}

export const rootRoute: RouteObject = {
  path: '/',
  element: <BasicLayout />,
  children: [
    { index: true, element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> },
    {
      path: toChildPath(ROUTE_PATHS.dashboard),
      element: (
        <Suspense fallback={<PageFallback />}>
          <DashboardPage />
        </Suspense>
      ),
    },
    { path: toChildPath(ROUTE_PATHS.copilot), element: <AiCopilotPage /> },
    { path: toChildPath(ROUTE_PATHS.lowcode), element: <LowCodePage /> },
    { path: toChildPath(ROUTE_PATHS.rag), element: <RagPage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
};

export const routes: RouteObject[] = [rootRoute];
