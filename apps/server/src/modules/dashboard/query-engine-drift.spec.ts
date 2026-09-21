/**
 * 漂移兜底：queryEngine 在 web（mock）和 server 各有一份实现，
 * 这里用同一组数据分别跑两份实现，断言 overview 输出逐字节一致。
 *
 * 两份数据来源也要对得上：web 用 getMockFacts，server 用 buildSeedFacts，
 * 它们是同一个生成器的两份拷贝，所以顺带把生成器也一起锁住。
 */

import type { DashboardOverview, DashboardQuery } from '@ai-ad-copilot/shared';

import { diffInDays, shiftDateRange } from '../../common/utils/date';
import * as webEngine from '../../../../web/src/services/mock/queryEngine';
import { getMockFacts } from '../../../../web/src/services/mock/dashboardData';
import * as serverEngine from './query-engine';
import { buildSeedFacts, resolveSeedRange, type DailyFact } from './seed-data';

type ServerEngine = typeof serverEngine;

/** 与 web mock dashboardService.getOverview 完全一致的组装逻辑 */
function buildOverview(
  engine: ServerEngine,
  facts: DailyFact[],
  query: DashboardQuery,
): DashboardOverview {
  const span = diffInDays(query.from, query.to) + 1;
  const previousRange = shiftDateRange({ from: query.from, to: query.to }, -span);
  const scoped = engine.filterFacts(facts, query);
  const previousFacts = engine.filterFacts(facts, { ...query, ...previousRange });

  return {
    query: { ...query },
    metrics: engine.aggregateMetrics(scoped),
    previous: previousFacts.length > 0 ? engine.aggregateMetrics(previousFacts) : null,
    trend: engine.buildTrend(scoped, query.from, query.to),
    channels: engine.buildChannelMetrics(scoped),
    funnel: engine.buildFunnel(scoped),
    updatedAt: `${query.to}T23:59:59+08:00`,
  };
}

const TODAY = '2026-09-20';
const RANGE = resolveSeedRange(TODAY, 90);

const webFacts = getMockFacts(RANGE.from, RANGE.to);
const serverFacts = buildSeedFacts(RANGE.from, RANGE.to);

function expectNoDrift(query: DashboardQuery): void {
  const webOverview = buildOverview(webEngine, webFacts, query);
  const serverOverview = buildOverview(serverEngine, serverFacts, query);

  expect(JSON.stringify(serverOverview)).toBe(JSON.stringify(webOverview));
  expect(serverOverview).toEqual(webOverview);
}

describe('web mock 与 server queryEngine 口径一致性', () => {
  it('生成器逐值一致（30 计划 × 最多 90 天）', () => {
    expect(serverFacts).toEqual(webFacts);
    expect(serverFacts).toHaveLength(2640);
  });

  it('默认区间（近 14 天全渠道）overview 输出完全一致', () => {
    expectNoDrift({ from: '2026-09-07', to: TODAY });
  });

  it('多选渠道过滤后输出完全一致', () => {
    expectNoDrift({ from: '2026-09-07', to: TODAY, channels: ['douyin', 'baidu'] });
  });

  it('单计划过滤后输出完全一致', () => {
    expectNoDrift({ from: '2026-08-01', to: TODAY, planId: 'p-201' });
  });

  it('ended 计划截止后的空数据区间输出完全一致', () => {
    expectNoDrift({ from: '2026-09-15', to: TODAY, planId: 'p-101' });
  });

  it('跨 90 天的长区间输出完全一致', () => {
    expectNoDrift({ from: RANGE.from, to: RANGE.to });
  });
});
