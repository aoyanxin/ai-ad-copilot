/** 前端路由路径常量，供路由表、侧边栏菜单与测试共用 */
export const ROUTE_PATHS = {
  dashboard: '/dashboard',
  copilot: '/copilot',
  lowcode: '/lowcode',
  rag: '/rag',
} as const;

export type RouteKey = keyof typeof ROUTE_PATHS;

export type RoutePath = (typeof ROUTE_PATHS)[RouteKey];

/** 首页重定向目标 */
export const DEFAULT_ROUTE_PATH: RoutePath = ROUTE_PATHS.dashboard;
