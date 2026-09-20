import { DEFAULT_ROUTE_PATH, ROUTE_PATHS, type RoutePath } from '@ai-ad-copilot/shared';
import { Navigate, type RouteObject } from 'react-router-dom';

import { BasicLayout } from '../layouts/BasicLayout';
import { AiCopilotPage } from '../pages/AiCopilot';
import { DashboardPage } from '../pages/Dashboard';
import { LowCodePage } from '../pages/LowCode';
import { NotFoundPage } from '../pages/NotFound';
import { RagPage } from '../pages/Rag';

/** 父路由为 '/'，子路由必须是相对路径，从 ROUTE_PATHS 派生以避免两处漂移 */
export function toChildPath(path: RoutePath): string {
  return path.replace(/^\//, '');
}

export const rootRoute: RouteObject = {
  path: '/',
  element: <BasicLayout />,
  children: [
    { index: true, element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> },
    { path: toChildPath(ROUTE_PATHS.dashboard), element: <DashboardPage /> },
    { path: toChildPath(ROUTE_PATHS.copilot), element: <AiCopilotPage /> },
    { path: toChildPath(ROUTE_PATHS.lowcode), element: <LowCodePage /> },
    { path: toChildPath(ROUTE_PATHS.rag), element: <RagPage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
};

export const routes: RouteObject[] = [rootRoute];
