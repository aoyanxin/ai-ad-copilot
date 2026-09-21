import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import type { AdChannel, AdPlanStatus } from '@ai-ad-copilot/shared';

import { ErrorCode } from '../../common/constants/error-code';
import { MemoryCacheService } from '../../common/cache/memory-cache.service';
import { DashboardService, resolveOverviewCacheTtl } from './dashboard.service';
import type { DashboardRepository } from './dashboard.repository';
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
    planId: 'p-101',
    planName: '抖音-秋季上新-信息流',
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

function createRepository(): { findAllFacts: jest.Mock; findPlanRecords: jest.Mock } {
  return { findAllFacts: jest.fn(), findPlanRecords: jest.fn() };
}

function createService(
  repository = createRepository(),
  cache = new MemoryCacheService(),
  env: Record<string, string> = {},
): {
  service: DashboardService;
  repository: { findAllFacts: jest.Mock; findPlanRecords: jest.Mock };
  cache: MemoryCacheService;
} {
  const service = new DashboardService(
    repository as unknown as DashboardRepository,
    cache,
    new ConfigService(env),
  );
  return { service, repository, cache };
}

const RANGE = { from: '2026-09-07', to: '2026-09-20' };

describe('DashboardService.getOverview', () => {
  it('同时查当前区间与等长的上一周期（环比）', async () => {
    const repository = createRepository();
    repository.findAllFacts
      .mockResolvedValueOnce([createFact({ date: '2026-09-20', spend: 100 })])
      .mockResolvedValueOnce([createFact({ date: '2026-09-06', spend: 50 })]);
    const { service } = createService(repository);

    const overview = await service.getOverview(RANGE);

    expect(repository.findAllFacts).toHaveBeenNthCalledWith(1, '2026-09-07', '2026-09-20');
    expect(repository.findAllFacts).toHaveBeenNthCalledWith(2, '2026-08-24', '2026-09-06');
    expect(overview.metrics.spend).toBe(100);
    expect(overview.previous?.spend).toBe(50);
  });

  it('上一周期没有数据时 previous 为 null', async () => {
    const repository = createRepository();
    repository.findAllFacts
      .mockResolvedValueOnce([createFact({ spend: 100 })])
      .mockResolvedValueOnce([]);
    const { service } = createService(repository);

    const overview = await service.getOverview(RANGE);

    expect(overview.previous).toBeNull();
  });

  it('回显规范化后的 query，且 updatedAt 固定为区间终点', async () => {
    const repository = createRepository();
    repository.findAllFacts.mockResolvedValue([]);
    const { service } = createService(repository);

    const overview = await service.getOverview({
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['douyin'],
    });

    expect(overview.query).toEqual({
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['douyin'],
    });
    expect(Object.keys(overview.query)).toEqual(['from', 'to', 'channels']);
    expect(overview.updatedAt).toBe('2026-09-20T23:59:59+08:00');
  });

  it('缓存命中：同参数第二次请求不再查库', async () => {
    const repository = createRepository();
    repository.findAllFacts.mockResolvedValue([createFact()]);
    const { service } = createService(repository);

    const first = await service.getOverview(RANGE);
    const second = await service.getOverview(RANGE);

    // 只有首轮真正查库：当前区间 + 上一周期各一次
    expect(repository.findAllFacts).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it('缓存命中：渠道顺序不同 / 渠道重复视为同一查询', async () => {
    const repository = createRepository();
    repository.findAllFacts.mockResolvedValue([createFact()]);
    const { service } = createService(repository);

    await service.getOverview({ ...RANGE, channels: ['douyin', 'baidu'] });
    await service.getOverview({ ...RANGE, channels: ['baidu', 'douyin', 'baidu'] });

    expect(repository.findAllFacts).toHaveBeenCalledTimes(2);
  });

  it('区间非法时抛 40001，且不查库', async () => {
    const repository = createRepository();
    const { service } = createService(repository);

    await expect(service.getOverview({ from: '2026-09-20', to: '2026-09-01' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.getOverview({ from: '2026-01-01', to: '2026-06-01' }),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.INVALID_QUERY_RANGE },
    });
    expect(repository.findAllFacts).not.toHaveBeenCalled();
  });

  it('overview 里所有指标都是 number，不出现 Decimal 形态', async () => {
    const repository = createRepository();
    repository.findAllFacts
      .mockResolvedValueOnce([createFact({ spend: 1234.56, revenue: 2345.67 })])
      .mockResolvedValueOnce([]);
    const { service } = createService(repository);

    const overview = await service.getOverview(RANGE);

    expect(typeof overview.metrics.spend).toBe('number');
    expect(typeof overview.metrics.revenue).toBe('number');
    expect(typeof overview.metrics.roi).toBe('number');
    expect(JSON.stringify(overview)).not.toMatch(/"s":\s*-?\d+/);
  });
});

describe('DashboardService.getRecords', () => {
  it('明细表不走缓存，每次请求都查库', async () => {
    const repository = createRepository();
    const cache = new MemoryCacheService();
    const cacheGetSpy = jest.spyOn(cache, 'get');
    repository.findPlanRecords.mockResolvedValue([
      createFact({ date: '2026-09-18' }),
      createFact({ date: '2026-09-20' }),
    ]);
    const { service } = createService(repository, cache);

    await service.getRecords({ ...RANGE, page: 1, pageSize: 10 });
    await service.getRecords({ ...RANGE, page: 1, pageSize: 10 });

    expect(repository.findPlanRecords).toHaveBeenCalledTimes(2);
    expect(cacheGetSpy).not.toHaveBeenCalled();
  });

  it('updatedAt 取区间内 MAX(metric.date)，不是区间终点也不是计划时间', async () => {
    const repository = createRepository();
    repository.findPlanRecords.mockResolvedValue([
      createFact({ date: '2026-09-15' }),
      createFact({ date: '2026-09-18' }),
    ]);
    const { service } = createService(repository);

    const result = await service.getRecords({ ...RANGE, page: 1, pageSize: 10 });

    expect(result.list).toHaveLength(1);
    expect(result.list[0].updatedAt).toBe('2026-09-18T23:59:59+08:00');
  });

  it('把列筛选与分页排序完整下推给仓储与引擎', async () => {
    const repository = createRepository();
    repository.findPlanRecords.mockResolvedValue([
      createFact({ planId: 'p-101', planName: '抖音-秋季上新', spend: 100 }),
      createFact({ planId: 'p-201', planName: '快手-秋季上新', spend: 300, channel: 'kuaishou' }),
    ]);
    const { service } = createService(repository);

    const result = await service.getRecords({
      ...RANGE,
      channels: ['douyin', 'kuaishou'],
      statuses: ['active'],
      keyword: '上新',
      page: 1,
      pageSize: 1,
      sortField: 'spend',
      sortOrder: 'desc',
    });

    expect(repository.findPlanRecords).toHaveBeenCalledWith('2026-09-07', '2026-09-20', {
      planId: undefined,
      channels: ['douyin', 'kuaishou'],
      statuses: ['active'],
      keyword: '上新',
    });
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
    expect(result.list.map((record) => record.planId)).toEqual(['p-201']);
  });

  it('区间非法时抛 40001，且不查库', async () => {
    const repository = createRepository();
    const { service } = createService(repository);

    await expect(
      service.getRecords({ from: '2026-09-20', to: '2026-09-01', page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ response: { code: ErrorCode.INVALID_QUERY_RANGE } });
    expect(repository.findPlanRecords).not.toHaveBeenCalled();
  });
});

describe('resolveOverviewCacheTtl', () => {
  it('默认 5 分钟', () => {
    expect(resolveOverviewCacheTtl(undefined)).toBe(300);
    expect(resolveOverviewCacheTtl('')).toBe(300);
  });

  it('CACHE_TTL_SECONDS 可覆盖', () => {
    expect(resolveOverviewCacheTtl('600')).toBe(600);
    expect(resolveOverviewCacheTtl(60)).toBe(60);
    expect(resolveOverviewCacheTtl('30.9')).toBe(30);
  });

  it('非法值回落到默认', () => {
    expect(resolveOverviewCacheTtl('abc')).toBe(300);
    expect(resolveOverviewCacheTtl('0')).toBe(300);
    expect(resolveOverviewCacheTtl('-5')).toBe(300);
  });

  it('ConfigService 里读到非法值时不影响服务构造', async () => {
    const repository = createRepository();
    repository.findAllFacts.mockResolvedValue([]);
    const { service } = createService(repository, new MemoryCacheService(), {
      CACHE_TTL_SECONDS: 'not-a-number',
    });

    await expect(service.getOverview(RANGE)).resolves.toBeDefined();
  });
});
