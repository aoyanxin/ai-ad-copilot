import type {
  AdPlanOption,
  AdPlanQuery,
  DashboardOverview,
  DashboardQuery,
  DashboardRecordsQuery,
  DashboardRecordsResponse,
} from '@ai-ad-copilot/shared';

export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * 看板数据源契约：mock 实现与 HTTP 实现必须同时满足它。
 * 页面/ hooks 只依赖这个接口，后端就绪后切换 VITE_API_MODE 即可，无需改页面。
 */
export interface DashboardService {
  getOverview(query: DashboardQuery, options?: RequestOptions): Promise<DashboardOverview>;
  getRecords(query: DashboardRecordsQuery, options?: RequestOptions): Promise<DashboardRecordsResponse>;
  getAdPlans(query?: AdPlanQuery, options?: RequestOptions): Promise<AdPlanOption[]>;
}
