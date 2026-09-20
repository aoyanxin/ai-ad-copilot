/**
 * 数据源出口：mock 与真实接口在这里二选一，页面只依赖 DashboardService 契约。
 * 后端就绪后设置 VITE_API_MODE=real 即可切换，前端页面与 hooks 无需改动。
 */

import type {
  AdPlanOption,
  DashboardOverview,
  DashboardRecordsResponse,
} from '@ai-ad-copilot/shared';

import {
  createMockDashboardService,
  resolveFailureEvery,
  resolveMockDelay,
} from './mock/dashboardService';
import { apiGet } from './http';
import type { DashboardService, RequestOptions } from './types';

export type { DashboardService, RequestOptions } from './types';
export { ApiRequestError, getErrorMessage } from './http';

/** 真实接口实现：路径与 README 中的契约表一致 */
export const httpDashboardService: DashboardService = {
  getOverview(query, options?: RequestOptions): Promise<DashboardOverview> {
    return apiGet<DashboardOverview>(
      '/dashboard/overview',
      {
        from: query.from,
        to: query.to,
        channels: query.channels,
        planId: query.planId,
      },
      options,
    );
  },

  getRecords(query, options?: RequestOptions): Promise<DashboardRecordsResponse> {
    return apiGet<DashboardRecordsResponse>(
      '/dashboard/records',
      {
        from: query.from,
        to: query.to,
        channels: query.channels,
        planId: query.planId,
        page: query.page,
        pageSize: query.pageSize,
        sortField: query.sortField,
        sortOrder: query.sortOrder,
        statuses: query.statuses,
        keyword: query.keyword,
      },
      options,
    );
  },

  getAdPlans(query, options?: RequestOptions): Promise<AdPlanOption[]> {
    return apiGet<AdPlanOption[]>(
      '/ad-plans',
      {
        channels: query?.channels,
        statuses: query?.statuses,
        keyword: query?.keyword,
      },
      options,
    );
  },
};

export const mockDashboardService: DashboardService = createMockDashboardService({
  delayMs: resolveMockDelay(),
  failureEvery: resolveFailureEvery(),
});

export function getDashboardService(): DashboardService {
  return import.meta.env.VITE_API_MODE === 'real' ? httpDashboardService : mockDashboardService;
}
