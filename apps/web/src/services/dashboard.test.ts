import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getDashboardService,
  httpDashboardService,
  mockDashboardService,
} from './dashboard';
import { createMockDashboardService } from './mock/dashboardService';

const BASE_QUERY = { from: '2026-09-07', to: '2026-09-20' } as const;

const service = createMockDashboardService({ delayMs: 0 });

describe('mock service 确定性', () => {
  it('同一条 query 调两次 getOverview，返回的 JSON 完全相等', async () => {
    const query = { ...BASE_QUERY, channels: ['douyin', 'baidu'] as const };

    const first = await service.getOverview({ ...query, channels: [...query.channels] });
    const second = await service.getOverview({ ...query, channels: [...query.channels] });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('同一条 query 调两次 getRecords，返回的 JSON 完全相等', async () => {
    const query = { ...BASE_QUERY, page: 2, pageSize: 5, sortField: 'spend' as const, sortOrder: 'desc' as const };

    const first = await service.getRecords({ ...query });
    const second = await service.getRecords({ ...query });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('mock service 查询语义', () => {
  it('渠道筛选会真实改变指标', async () => {
    const all = await service.getOverview({ ...BASE_QUERY });
    const douyin = await service.getOverview({ ...BASE_QUERY, channels: ['douyin'] });
    const both = await service.getOverview({ ...BASE_QUERY, channels: ['douyin', 'baidu'] });

    expect(all.metrics.spend).toBeGreaterThan(douyin.metrics.spend);
    expect(douyin.metrics.spend).toBeGreaterThan(0);
    expect(both.metrics.spend).toBeGreaterThan(douyin.metrics.spend);
    expect(douyin.channels.map((item) => item.channel)).toEqual(['douyin']);
  });

  it('趋势按天连续，漏斗单调不增', async () => {
    const overview = await service.getOverview({ ...BASE_QUERY });

    expect(overview.trend).toHaveLength(14);
    expect(overview.trend[0].date).toBe('2026-09-07');
    expect(overview.trend[13].date).toBe('2026-09-20');

    const funnelValues = overview.funnel.map((stage) => stage.value);
    expect(funnelValues).toEqual([...funnelValues].sort((left, right) => right - left));
    expect(overview.funnel[0].key).toBe('impression');
  });

  it('计划筛选只返回该计划的数据', async () => {
    const plans = await service.getAdPlans();
    const plan = plans[0];

    const overview = await service.getOverview({ ...BASE_QUERY, planId: plan.planId });
    const records = await service.getRecords({
      ...BASE_QUERY,
      page: 1,
      pageSize: 50,
      planId: plan.planId,
    });

    expect(records.list).toHaveLength(1);
    expect(records.list[0].planId).toBe(plan.planId);
    expect(overview.metrics.spend).toBeCloseTo(records.list[0].spend, 2);
  });

  it('明细表支持分页、排序与列筛选', async () => {
    const firstPage = await service.getRecords({
      ...BASE_QUERY,
      page: 1,
      pageSize: 5,
      sortField: 'spend',
      sortOrder: 'desc',
    });
    const secondPage = await service.getRecords({
      ...BASE_QUERY,
      page: 2,
      pageSize: 5,
      sortField: 'spend',
      sortOrder: 'desc',
    });

    expect(firstPage.total).toBe(30);
    expect(firstPage.list).toHaveLength(5);
    expect(firstPage.list[0].spend).toBeGreaterThanOrEqual(firstPage.list[4].spend);
    expect(secondPage.list[0].planId).not.toBe(firstPage.list[0].planId);

    const filtered = await service.getRecords({
      ...BASE_QUERY,
      page: 1,
      pageSize: 50,
      statuses: ['paused'],
    });
    expect(filtered.list.every((record) => record.status === 'paused')).toBe(true);

    const searched = await service.getRecords({
      ...BASE_QUERY,
      page: 1,
      pageSize: 50,
      keyword: '抖音',
    });
    expect(searched.list.every((record) => record.planName.includes('抖音'))).toBe(true);
  });

  it('计划下拉支持渠道、状态与关键字过滤', async () => {
    const all = await service.getAdPlans();
    const douyin = await service.getAdPlans({ channels: ['douyin'] });
    const active = await service.getAdPlans({ statuses: ['active'] });
    const keyword = await service.getAdPlans({ keyword: '小红书' });

    expect(all).toHaveLength(30);
    expect(douyin.every((plan) => plan.channel === 'douyin')).toBe(true);
    expect(active.every((plan) => plan.status === 'active')).toBe(true);
    expect(keyword).toHaveLength(6);
  });

  it('越界分页返回空列表但保留 total，便于前端展示空态', async () => {
    const result = await service.getRecords({ ...BASE_QUERY, page: 99, pageSize: 10 });
    expect(result.list).toEqual([]);
    expect(result.total).toBe(30);
  });

  it('无数据时返回全 0 指标与空数组，而不是抛错（前端据此展示空态）', async () => {
    // p-101 是已结束计划，截止日之后不再产出数据
    const ended = await service.getOverview({ from: '2026-09-15', to: '2026-09-20', planId: 'p-101' });

    expect(ended.metrics.spend).toBe(0);
    expect(ended.metrics.roi).toBe(0);
    expect(ended.channels).toEqual([]);
    expect(ended.funnel.map((stage) => stage.value)).toEqual([0, 0, 0, 0]);
    expect(ended.trend).toHaveLength(6);
    expect(ended.trend.every((point) => point.spend === 0)).toBe(true);

    // 计划与渠道互斥时同样返回空结果，接口层不抛错
    const mismatched = await service.getOverview({
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['baidu'],
      planId: 'p-101',
    });
    expect(mismatched.metrics.spend).toBe(0);
  });
});

describe('http service 契约', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按 README 契约拼出 REST 路径与查询参数', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await httpDashboardService.getRecords({
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['douyin', 'baidu'],
      planId: 'p-101',
      page: 2,
      pageSize: 20,
      sortField: 'roi',
      sortOrder: 'asc',
      statuses: ['active'],
      keyword: '秋季',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/dashboard/records?');
    expect(url).toContain('channels=douyin%2Cbaidu');
    expect(url).toContain('planId=p-101');
    expect(url).toContain('sortField=roi');
    expect(url).toContain('sortOrder=asc');
    expect(url).toContain('keyword=%E7%A7%8B%E5%AD%A3');
    expect(url).toContain('page=2');
  });
});

describe('getDashboardService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认返回 mock 实现', () => {
    expect(getDashboardService()).toBe(mockDashboardService);
  });

  it('VITE_API_MODE=real 时切换到 HTTP 实现', () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    expect(getDashboardService()).toBe(httpDashboardService);
  });
});
