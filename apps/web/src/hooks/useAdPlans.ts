import type { AdPlanOption, AdPlanQuery } from '@ai-ad-copilot/shared';

import { getDashboardService, type DashboardService } from '../services/dashboard';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

function toAdPlanQueryKey(query: AdPlanQuery): string {
  return [(query.channels ?? []).join(','), (query.statuses ?? []).join(','), query.keyword ?? ''].join(
    '|',
  );
}

/** 广告计划下拉选项，跟随已选渠道/状态/关键字变化 */
export function useAdPlans(
  query: AdPlanQuery,
  service: DashboardService = getDashboardService(),
): AsyncResourceState<AdPlanOption[]> {
  return useAsyncResource(toAdPlanQueryKey(query), (signal) => service.getAdPlans(query, { signal }));
}
