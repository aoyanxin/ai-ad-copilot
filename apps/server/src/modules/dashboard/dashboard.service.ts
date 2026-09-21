import type {
  AdPlanRecord,
  DashboardOverview,
  DashboardQuery,
  DashboardRecordsQuery,
  DashboardRecordsResponse,
} from '@ai-ad-copilot/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheService } from '../../common/cache/cache.service';
import { buildOverviewCacheKey } from '../../common/cache/cache-key';
import { diffInDays, shiftDateRange, type DateRange } from '../../common/utils/date';
import { DashboardRepository } from './dashboard.repository';
import {
  aggregateMetrics,
  aggregateRecords,
  buildChannelMetrics,
  buildFunnel,
  buildTrend,
  filterFacts,
  filterRecords,
  paginate,
  sortRecords,
} from './query-engine';
import { validateDashboardDateRange } from './query-range';

/** overview 缓存 TTL 默认 5 分钟，可用 CACHE_TTL_SECONDS 覆盖 */
export const DEFAULT_OVERVIEW_CACHE_TTL_SECONDS = 300;
export const CACHE_TTL_CONFIG_KEY = 'CACHE_TTL_SECONDS';

export function resolveOverviewCacheTtl(
  raw: string | number | undefined,
  fallback: number = DEFAULT_OVERVIEW_CACHE_TTL_SECONDS,
): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** 只保留契约字段，避免 DTO 实例上的 undefined 键进入响应体 */
function toDashboardQuery(query: DashboardQuery): DashboardQuery {
  const normalized: DashboardQuery = { from: query.from, to: query.to };

  if (query.channels && query.channels.length > 0) {
    normalized.channels = [...query.channels];
  }
  if (query.planId) {
    normalized.planId = query.planId;
  }

  return normalized;
}

function toRecordsQuery(query: DashboardRecordsQuery): DashboardRecordsQuery {
  const normalized: DashboardRecordsQuery = {
    ...toDashboardQuery(query),
    page: query.page,
    pageSize: query.pageSize,
  };

  if (query.sortField) {
    normalized.sortField = query.sortField;
    normalized.sortOrder = query.sortOrder ?? 'desc';
  }
  if (query.statuses && query.statuses.length > 0) {
    normalized.statuses = [...query.statuses];
  }
  if (query.keyword) {
    normalized.keyword = query.keyword;
  }

  return normalized;
}

/** 等长的上一周期，用于环比 */
function resolvePreviousRange(range: DateRange): DateRange {
  const span = diffInDays(range.from, range.to) + 1;
  return shiftDateRange(range, -span);
}

@Injectable()
export class DashboardService {
  private readonly overviewTtlSeconds: number;

  constructor(
    private readonly repository: DashboardRepository,
    private readonly cache: CacheService,
    configService: ConfigService,
  ) {
    this.overviewTtlSeconds = resolveOverviewCacheTtl(
      configService.get<string | number>(CACHE_TTL_CONFIG_KEY),
    );
  }

  async getOverview(query: DashboardQuery): Promise<DashboardOverview> {
    validateDashboardDateRange(query.from, query.to);

    const normalized = toDashboardQuery(query);
    const cacheKey = buildOverviewCacheKey(normalized);

    return this.cache.withCache(cacheKey, this.overviewTtlSeconds, () =>
      this.loadOverview(normalized),
    );
  }

  async getRecords(query: DashboardRecordsQuery): Promise<DashboardRecordsResponse> {
    validateDashboardDateRange(query.from, query.to);

    const normalized = toRecordsQuery(query);
    // 明细表不走缓存：分页 / 排序组合太多，命中率低且结果集随筛选变化
    const facts = await this.repository.findPlanRecords(normalized.from, normalized.to, {
      planId: normalized.planId,
      channels: normalized.channels,
      statuses: normalized.statuses,
      keyword: normalized.keyword,
    });

    const records: AdPlanRecord[] = filterRecords(
      aggregateRecords(filterFacts(facts, normalized)),
      normalized,
    );
    const sorted = sortRecords(records, normalized.sortField, normalized.sortOrder);

    return paginate(sorted, normalized.page, normalized.pageSize);
  }

  private async loadOverview(query: DashboardQuery): Promise<DashboardOverview> {
    const previousRange = resolvePreviousRange(query);

    const [facts, previousFacts] = await Promise.all([
      this.repository.findAllFacts(query.from, query.to),
      this.repository.findAllFacts(previousRange.from, previousRange.to),
    ]);

    const scoped = filterFacts(facts, query);
    const scopedPrevious = filterFacts(previousFacts, { ...query, ...previousRange });

    return {
      query,
      metrics: aggregateMetrics(scoped),
      previous: scopedPrevious.length > 0 ? aggregateMetrics(scopedPrevious) : null,
      trend: buildTrend(scoped, query.from, query.to),
      channels: buildChannelMetrics(scoped),
      funnel: buildFunnel(scoped),
      // 固定为区间终点，保证同参数调用结果完全一致（缓存友好）
      updatedAt: `${query.to}T23:59:59+08:00`,
    };
  }
}
