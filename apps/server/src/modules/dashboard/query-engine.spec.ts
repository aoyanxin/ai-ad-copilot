import type { AdChannel, AdPlanStatus } from '@ai-ad-copilot/shared';

import {
  EMPTY_METRICS,
  aggregateMetrics,
  aggregateRecords,
  buildChannelMetrics,
  buildFunnel,
  buildTrend,
  filterFacts,
  filterRecords,
  paginate,
  queryRecords,
  sortRecords,
} from './query-engine';
import type { DailyFact } from './seed-data';

interface FactOverrides {
  date?: string;
  planId?: string;
  planName?: string;
  channel?: AdChannel;
  status?: AdPlanStatus;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  orders?: number;
  spend?: number;
  revenue?: number;
}

function createFact(overrides: FactOverrides = {}): DailyFact {
  return {
    date: '2026-09-20',
    planId: 'p-1001',
    planName: '秋季上新-抖音',
    channel: 'douyin',
    status: 'active',
    impressions: 1000,
    clicks: 100,
    conversions: 10,
    orders: 5,
    spend: 200,
    revenue: 500,
    ...overrides,
  };
}

describe('filterFacts', () => {
  const facts: DailyFact[] = [
    createFact({ date: '2026-09-07' }),
    createFact({ date: '2026-09-20' }),
    createFact({ date: '2026-09-21' }),
    createFact({ date: '2026-09-20', channel: 'baidu', planId: 'p-2001' }),
  ];

  it('日期区间为闭区间', () => {
    const result = filterFacts(facts, { from: '2026-09-07', to: '2026-09-20' });
    expect(result.map((fact) => fact.date)).toEqual([
      '2026-09-07',
      '2026-09-20',
      '2026-09-20',
    ]);
  });

  it('空渠道数组等价于全部渠道', () => {
    const result = filterFacts(facts, { from: '2026-09-01', to: '2026-09-30', channels: [] });
    expect(result).toHaveLength(4);
  });

  it('按渠道与计划过滤', () => {
    const byChannel = filterFacts(facts, {
      from: '2026-09-01',
      to: '2026-09-30',
      channels: ['baidu'],
    });
    expect(byChannel.map((fact) => fact.planId)).toEqual(['p-2001']);

    const byPlan = filterFacts(facts, {
      from: '2026-09-01',
      to: '2026-09-30',
      planId: 'p-1001',
    });
    expect(byPlan).toHaveLength(3);
  });
});

describe('aggregateMetrics', () => {
  it('空数据返回全 0，避免 NaN 进入图表', () => {
    expect(aggregateMetrics([])).toEqual(EMPTY_METRICS);
    expect(aggregateMetrics([]).roi).toBe(0);
  });

  it('汇总消耗/收入/点击并计算 CTR、CVR、ROI', () => {
    const metrics = aggregateMetrics([
      createFact(),
      createFact({
        date: '2026-09-19',
        impressions: 1000,
        clicks: 300,
        conversions: 30,
        spend: 800,
        revenue: 1500,
      }),
    ]);

    expect(metrics.impressions).toBe(2000);
    expect(metrics.clicks).toBe(400);
    expect(metrics.conversions).toBe(40);
    expect(metrics.spend).toBe(1000);
    expect(metrics.revenue).toBe(2000);
    expect(metrics.ctr).toBe(0.2);
    expect(metrics.cvr).toBe(0.1);
    expect(metrics.roi).toBe(2);
  });

  it('消耗为 0 时 ROI 取 0 而不是 Infinity', () => {
    const metrics = aggregateMetrics([createFact({ spend: 0, revenue: 0 })]);
    expect(metrics.roi).toBe(0);
  });
});

describe('buildTrend', () => {
  it('按天聚合且缺失日期补 0，保证 X 轴连续', () => {
    const trend = buildTrend(
      [
        createFact({ date: '2026-09-18', spend: 100, clicks: 10, conversions: 1 }),
        createFact({ date: '2026-09-20', spend: 50.5, clicks: 5, conversions: 0 }),
      ],
      '2026-09-18',
      '2026-09-20',
    );

    expect(trend).toEqual([
      { date: '2026-09-18', spend: 100, clicks: 10, conversions: 1 },
      { date: '2026-09-19', spend: 0, clicks: 0, conversions: 0 },
      { date: '2026-09-20', spend: 50.5, clicks: 5, conversions: 0 },
    ]);
  });

  it('区间非法时返回空数组', () => {
    expect(buildTrend([], '2026-09-20', '2026-09-01')).toEqual([]);
  });
});

describe('buildChannelMetrics', () => {
  it('只返回有数据的渠道，并保持声明顺序', () => {
    const channels = buildChannelMetrics([
      createFact({ channel: 'baidu' }),
      createFact({ channel: 'douyin' }),
      createFact({ channel: 'douyin', date: '2026-09-19' }),
    ]);

    expect(channels.map((item) => item.channel)).toEqual(['douyin', 'baidu']);
    expect(channels[0].spend).toBe(400);
    expect(channels[1].spend).toBe(200);
  });
});

describe('buildFunnel', () => {
  it('输出四个阶段，rate 为相对上一阶段的转化率', () => {
    const funnel = buildFunnel([createFact()]);

    expect(funnel.map((stage) => stage.key)).toEqual([
      'impression',
      'click',
      'conversion',
      'order',
    ]);
    expect(funnel.map((stage) => stage.value)).toEqual([1000, 100, 10, 5]);
    expect(funnel[0].rate).toBe(1);
    expect(funnel[1].rate).toBe(0.1);
    expect(funnel[2].rate).toBe(0.1);
    expect(funnel[3].rate).toBe(0.5);
  });

  it('曝光为 0 时转化率取 0 而不是 NaN', () => {
    const funnel = buildFunnel([
      createFact({ impressions: 0, clicks: 0, conversions: 0, orders: 0 }),
    ]);
    expect(funnel.map((stage) => stage.rate)).toEqual([1, 0, 0, 0]);
  });
});

describe('aggregateRecords', () => {
  it('按 计划 + 渠道 聚合，updatedAt 取最新数据日期', () => {
    const records = aggregateRecords([
      createFact({ date: '2026-09-18', spend: 100 }),
      createFact({ date: '2026-09-20', spend: 300 }),
      createFact({ date: '2026-09-19', channel: 'baidu', planId: 'p-2001', spend: 50 }),
    ]);

    expect(records).toHaveLength(2);
    const douyin = records.find((record) => record.planId === 'p-1001');
    expect(douyin?.spend).toBe(400);
    expect(douyin?.updatedAt).toBe('2026-09-20T23:59:59+08:00');
    expect(records.find((record) => record.planId === 'p-2001')?.channel).toBe('baidu');
  });
});

describe('filterRecords / sortRecords / paginate', () => {
  const records = aggregateRecords([
    createFact({ planId: 'p-1', planName: '秋季上新', spend: 100, status: 'active' }),
    createFact({ planId: 'p-2', planName: '春季爆款', spend: 300, status: 'paused' }),
    createFact({ planId: 'p-3', planName: '秋季清仓', spend: 200, status: 'ended' }),
  ]);

  it('状态列筛选为多选，空数组表示不过滤', () => {
    expect(
      filterRecords(records, { page: 1, pageSize: 10, from: '', to: '', statuses: [] }),
    ).toHaveLength(3);
    expect(
      filterRecords(records, {
        page: 1,
        pageSize: 10,
        from: '',
        to: '',
        statuses: ['active', 'ended'],
      }).map((record) => record.planId),
    ).toEqual(['p-1', 'p-3']);
  });

  it('计划名列筛选为不区分大小写的模糊匹配', () => {
    const matched = filterRecords(records, {
      page: 1,
      pageSize: 10,
      from: '',
      to: '',
      keyword: '秋季',
    });
    expect(matched.map((record) => record.planId)).toEqual(['p-1', 'p-3']);
  });

  it('按数值字段排序，方向可切换', () => {
    expect(sortRecords(records, 'spend', 'desc').map((record) => record.planId)).toEqual([
      'p-2',
      'p-3',
      'p-1',
    ]);
    expect(sortRecords(records, 'spend', 'asc').map((record) => record.planId)).toEqual([
      'p-1',
      'p-3',
      'p-2',
    ]);
  });

  it('同值行按 planId 兜底排序，保证分页稳定', () => {
    const tied = aggregateRecords([
      createFact({ planId: 'p-9', spend: 100 }),
      createFact({ planId: 'p-2', spend: 100 }),
      createFact({ planId: 'p-5', spend: 100 }),
    ]);
    expect(sortRecords(tied, 'spend', 'desc').map((record) => record.planId)).toEqual([
      'p-2',
      'p-5',
      'p-9',
    ]);
  });

  it('分页返回切片并回显页码，越界页码被纠正', () => {
    const page = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(page).toEqual({ list: [3, 4], total: 5, page: 2, pageSize: 2 });

    const fallback = paginate([1, 2, 3], 0, 0);
    expect(fallback.page).toBe(1);
    expect(fallback.pageSize).toBe(1);
  });
});

describe('queryRecords', () => {
  it('串起过滤、聚合、列筛选、排序与分页', () => {
    const facts = [
      createFact({ planId: 'p-1', planName: 'A 计划', spend: 100 }),
      createFact({ planId: 'p-2', planName: 'B 计划', spend: 300 }),
      createFact({ planId: 'p-3', planName: 'C 计划', spend: 200, channel: 'baidu' }),
    ];

    const result = queryRecords(facts, {
      from: '2026-09-01',
      to: '2026-09-30',
      channels: ['douyin'],
      page: 1,
      pageSize: 1,
      sortField: 'spend',
      sortOrder: 'desc',
    });

    expect(result.total).toBe(2);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].planId).toBe('p-2');
  });
});
