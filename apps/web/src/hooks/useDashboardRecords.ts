import type { DashboardRecordsQuery, DashboardRecordsResponse } from '@ai-ad-copilot/shared';

import { getDashboardService, type DashboardService } from '../services/dashboard';
import { toRecordsQueryKey } from '../pages/Dashboard/utils/filters';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

/** 明细表数据：分页、排序、列筛选都是服务端语义，变化即重新请求 */
export function useDashboardRecords(
  query: DashboardRecordsQuery,
  service: DashboardService = getDashboardService(),
): AsyncResourceState<DashboardRecordsResponse> {
  return useAsyncResource(toRecordsQueryKey(query), (signal) => service.getRecords(query, { signal }));
}
