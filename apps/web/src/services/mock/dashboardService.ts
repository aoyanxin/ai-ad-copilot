/**
 * mock 版 DashboardService：在内存事实表上跑与后端一致的口径，
 * 并模拟网络耗时 / 偶发失败，方便验证 loading、错误与重试。
 */

import type {
  AdPlanOption,
  DashboardOverview,
  DashboardQuery,
  DashboardRecordsQuery,
  DashboardRecordsResponse,
} from '@ai-ad-copilot/shared';

import { diffInDays, shiftDateRange } from '../../utils/date';
import { ApiRequestError } from '../http';
import type { DashboardService, RequestOptions } from '../types';
import { MOCK_PLANS, getMockFacts } from './dashboardData';
import {
  aggregateMetrics,
  buildChannelMetrics,
  buildFunnel,
  buildTrend,
  filterFacts,
  queryRecords,
} from './queryEngine';

export interface MockDashboardServiceOptions {
  /** 模拟网络耗时（毫秒），0 表示立即返回 */
  delayMs?: number;
  /** 每 N 次调用抛一次错，用于验证错误态与重试；0 表示不模拟 */
  failureEvery?: number;
}

function createAbortError(): Error {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}

/** mock 延迟：默认 260ms 便于观察 loading；测试环境为 0 避免拖慢用例 */
export function resolveMockDelay(): number {
  const configured = Number(import.meta.env.VITE_MOCK_DELAY);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return import.meta.env.MODE === 'test' ? 0 : 260;
}

export function resolveFailureEvery(): number {
  const configured = Number(import.meta.env.VITE_MOCK_FAILURE_EVERY);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

function resolvePreviousRange(query: DashboardQuery): { from: string; to: string } {
  const span = diffInDays(query.from, query.to) + 1;
  return shiftDateRange({ from: query.from, to: query.to }, -span);
}

export function createMockDashboardService(
  options: MockDashboardServiceOptions = {},
): DashboardService {
  const { delayMs = 0, failureEvery = 0 } = options;
  let callCount = 0;

  async function simulateNetwork(signal?: AbortSignal): Promise<void> {
    callCount += 1;

    if (failureEvery > 0 && callCount % failureEvery === 0) {
      throw new ApiRequestError(50001, '模拟的接口异常（VITE_MOCK_FAILURE_EVERY）');
    }

    if (delayMs <= 0) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', handleAbort);
        resolve();
      }, delayMs);

      function handleAbort(): void {
        clearTimeout(timer);
        reject(createAbortError());
      }

      signal?.addEventListener('abort', handleAbort, { once: true });
    });
  }

  return {
    async getOverview(
      query: DashboardQuery,
      requestOptions?: RequestOptions,
    ): Promise<DashboardOverview> {
      await simulateNetwork(requestOptions?.signal);

      const facts = filterFacts(getMockFacts(query.from, query.to), query);
      const previousRange = resolvePreviousRange(query);
      const previousFacts = filterFacts(getMockFacts(previousRange.from, previousRange.to), {
        ...query,
        ...previousRange,
      });

      return {
        query: { ...query },
        metrics: aggregateMetrics(facts),
        previous: previousFacts.length > 0 ? aggregateMetrics(previousFacts) : null,
        trend: buildTrend(facts, query.from, query.to),
        channels: buildChannelMetrics(facts),
        funnel: buildFunnel(facts),
        // 固定为区间终点的截止时间，保证同参数调用返回完全一致的数据
        updatedAt: `${query.to}T23:59:59+08:00`,
      };
    },

    async getRecords(
      query: DashboardRecordsQuery,
      requestOptions?: RequestOptions,
    ): Promise<DashboardRecordsResponse> {
      await simulateNetwork(requestOptions?.signal);
      return queryRecords(getMockFacts(query.from, query.to), query);
    },

    async getAdPlans(query, requestOptions?: RequestOptions): Promise<AdPlanOption[]> {
      await simulateNetwork(requestOptions?.signal);

      const channels = query?.channels && query.channels.length > 0 ? new Set(query.channels) : null;
      const statuses =
        query?.statuses && query.statuses.length > 0 ? new Set(query.statuses) : null;
      const keyword = query?.keyword?.trim().toLowerCase() ?? '';

      return MOCK_PLANS.filter((plan) => {
        if (channels && !channels.has(plan.channel)) {
          return false;
        }
        if (statuses && !statuses.has(plan.status)) {
          return false;
        }
        if (keyword && !plan.planName.toLowerCase().includes(keyword)) {
          return false;
        }
        return true;
      }).map((plan) => ({ ...plan }));
    },
  };
}
