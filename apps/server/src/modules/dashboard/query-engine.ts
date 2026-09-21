/**
 * 看板的"服务端语义"：过滤 / 聚合 / 排序 / 分页。
 *
 * 本文件是 apps/web/src/services/mock/queryEngine.ts 的服务端移植版，
 * 两份实现的聚合口径必须完全一致（有漂移兜底测试兜住）。
 * 这里保持纯函数：不依赖 NestJS、不依赖 Prisma、不做任何 IO。
 */

import {
  AD_CHANNELS,
  FUNNEL_STAGE_KEYS,
  type AdChannel,
  type AdPlanRecord,
  type ChannelMetric,
  type DashboardQuery,
  type DashboardRecordsQuery,
  type FunnelStage,
  type MetricSummary,
  type PageResult,
  type TrendPoint,
} from '@ai-ad-copilot/shared';

import { eachDateKey } from '../../common/utils/date';
import type { DailyFact } from './seed-data';

export const EMPTY_METRICS: MetricSummary = {
  spend: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  ctr: 0,
  cvr: 0,
  roi: 0,
};

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumFacts(facts: DailyFact[]): {
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  spend: number;
  revenue: number;
} {
  return facts.reduce(
    (totals, fact) => ({
      impressions: totals.impressions + fact.impressions,
      clicks: totals.clicks + fact.clicks,
      conversions: totals.conversions + fact.conversions,
      orders: totals.orders + fact.orders,
      spend: totals.spend + fact.spend,
      revenue: totals.revenue + fact.revenue,
    }),
    { impressions: 0, clicks: 0, conversions: 0, orders: 0, spend: 0, revenue: 0 },
  );
}

/** 按日期区间（YYYY-MM-DD 字典序即时序）、渠道、计划过滤事实表 */
export function filterFacts(facts: DailyFact[], query: DashboardQuery): DailyFact[] {
  const channelSet =
    query.channels && query.channels.length > 0 ? new Set<AdChannel>(query.channels) : null;

  return facts.filter((fact) => {
    if (fact.date < query.from || fact.date > query.to) {
      return false;
    }
    if (channelSet && !channelSet.has(fact.channel)) {
      return false;
    }
    if (query.planId && fact.planId !== query.planId) {
      return false;
    }
    return true;
  });
}

export function aggregateMetrics(facts: DailyFact[]): MetricSummary {
  if (facts.length === 0) {
    return { ...EMPTY_METRICS };
  }

  const totals = sumFacts(facts);

  return {
    spend: round(totals.spend),
    revenue: round(totals.revenue),
    impressions: totals.impressions,
    clicks: totals.clicks,
    conversions: totals.conversions,
    ctr: round(safeDivide(totals.clicks, totals.impressions), 4),
    cvr: round(safeDivide(totals.conversions, totals.clicks), 4),
    roi: round(safeDivide(totals.revenue, totals.spend), 2),
  };
}

/** 按天聚合，缺失日期补 0，保证折线图 X 轴连续 */
export function buildTrend(facts: DailyFact[], from: string, to: string): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>();

  eachDateKey(from, to).forEach((date) => {
    buckets.set(date, { date, spend: 0, clicks: 0, conversions: 0 });
  });

  facts.forEach((fact) => {
    const point = buckets.get(fact.date);
    if (!point) {
      return;
    }
    point.spend += fact.spend;
    point.clicks += fact.clicks;
    point.conversions += fact.conversions;
  });

  return [...buckets.values()].map((point) => ({
    ...point,
    spend: round(point.spend),
  }));
}

/** 渠道对比：只返回有数据的渠道，顺序固定为 AD_CHANNELS 声明顺序 */
export function buildChannelMetrics(facts: DailyFact[]): ChannelMetric[] {
  const grouped = new Map<AdChannel, DailyFact[]>();

  facts.forEach((fact) => {
    const bucket = grouped.get(fact.channel);
    if (bucket) {
      bucket.push(fact);
    } else {
      grouped.set(fact.channel, [fact]);
    }
  });

  return AD_CHANNELS.flatMap((channel) => {
    const bucket = grouped.get(channel);
    return bucket ? [{ channel, ...aggregateMetrics(bucket) }] : [];
  });
}

/** 曝光 -> 点击 -> 转化 -> 成交，rate 为相对上一阶段的转化率 */
export function buildFunnel(facts: DailyFact[]): FunnelStage[] {
  const totals = sumFacts(facts);
  const values: Record<(typeof FUNNEL_STAGE_KEYS)[number], number> = {
    impression: totals.impressions,
    click: totals.clicks,
    conversion: totals.conversions,
    order: totals.orders,
  };

  let previous = 0;

  return FUNNEL_STAGE_KEYS.map((key, index) => {
    const value = values[key];
    const rate = index === 0 ? 1 : round(safeDivide(value, previous), 4);
    previous = value;
    return { key, value, rate };
  });
}

/** 按 计划 + 渠道 聚合出明细表行 */
export function aggregateRecords(facts: DailyFact[]): AdPlanRecord[] {
  const grouped = new Map<string, DailyFact[]>();

  facts.forEach((fact) => {
    const groupKey = `${fact.planId}::${fact.channel}`;
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(fact);
    } else {
      grouped.set(groupKey, [fact]);
    }
  });

  return [...grouped.values()].map((bucket) => {
    const first = bucket[0];
    const latestDate = bucket.reduce(
      (latest, fact) => (fact.date > latest ? fact.date : latest),
      first.date,
    );

    return {
      planId: first.planId,
      planName: first.planName,
      channel: first.channel,
      status: first.status,
      ...aggregateMetrics(bucket),
      updatedAt: `${latestDate}T23:59:59+08:00`,
    };
  });
}

/** 列筛选：状态多选 + 计划名模糊搜索 */
export function filterRecords(
  records: AdPlanRecord[],
  query: DashboardRecordsQuery,
): AdPlanRecord[] {
  const statusSet =
    query.statuses && query.statuses.length > 0 ? new Set(query.statuses) : null;
  const keyword = query.keyword?.trim().toLowerCase() ?? '';

  return records.filter((record) => {
    if (statusSet && !statusSet.has(record.status)) {
      return false;
    }
    if (keyword && !record.planName.toLowerCase().includes(keyword)) {
      return false;
    }
    return true;
  });
}

/** 排序：以 planId 兜底保证分页稳定（否则同值行顺序可能漂移） */
export function sortRecords(
  records: AdPlanRecord[],
  field: DashboardRecordsQuery['sortField'] = 'spend',
  order: DashboardRecordsQuery['sortOrder'] = 'desc',
): AdPlanRecord[] {
  const direction = order === 'asc' ? 1 : -1;

  return [...records].sort((left, right) => {
    if (field === 'updatedAt') {
      const compared = left.updatedAt.localeCompare(right.updatedAt);
      if (compared !== 0) {
        return compared * direction;
      }
    } else {
      const compared = left[field] - right[field];
      if (compared !== 0) {
        return compared * direction;
      }
    }
    return left.planId.localeCompare(right.planId);
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): PageResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const start = (safePage - 1) * safePageSize;

  return {
    list: items.slice(start, start + safePageSize),
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
  };
}

/** 明细表查询的完整链路：过滤 -> 聚合 -> 列筛选 -> 排序 -> 分页 */
export function queryRecords(
  facts: DailyFact[],
  query: DashboardRecordsQuery,
): PageResult<AdPlanRecord> {
  const scoped = aggregateRecords(filterFacts(facts, query));
  const filtered = filterRecords(scoped, query);
  const sorted = sortRecords(filtered, query.sortField, query.sortOrder);
  return paginate(sorted, query.page, query.pageSize);
}
