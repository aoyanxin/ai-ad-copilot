import type { DashboardOverview, DashboardQuery } from '@ai-ad-copilot/shared';

import { getDashboardService, type DashboardService } from '../services/dashboard';
import { toQueryKey } from '../pages/Dashboard/utils/filters';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

/** 概览数据（指标卡 + 趋势 + 渠道对比 + 漏斗），随筛选条件变化重新请求 */
export function useDashboardOverview(
  query: DashboardQuery,
  service: DashboardService = getDashboardService(),
): AsyncResourceState<DashboardOverview> {
  return useAsyncResource(toQueryKey(query), (signal) => service.getOverview(query, { signal }));
}
