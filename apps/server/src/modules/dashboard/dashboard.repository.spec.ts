import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { MemoryCacheService } from '../../common/cache/memory-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

const RANGE = { from: '2026-09-07', to: '2026-09-20' };

interface RowOverrides {
  planId?: string;
  date?: Date;
  spend?: string;
  revenue?: string;
  planName?: string;
  channel?: string;
  status?: string;
}

function createRow(overrides: RowOverrides = {}): Record<string, unknown> {
  return {
    planId: overrides.planId ?? 'p-101',
    date: overrides.date ?? new Date(Date.UTC(2026, 8, 20)),
    spend: new Prisma.Decimal(overrides.spend ?? '1234.56'),
    revenue: new Prisma.Decimal(overrides.revenue ?? '2345.67'),
    impressions: 1000,
    clicks: 100,
    conversions: 10,
    orders: 5,
    plan: {
      planName: overrides.planName ?? '抖音-秋季上新-信息流',
      channel: overrides.channel ?? 'douyin',
      status: overrides.status ?? 'active',
    },
  };
}

/** 递归找出 decimal.js 序列化形态 { s, e, d }，用于断言 Decimal 没有泄漏到 JSON */
function findDecimalLike(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDecimalLike(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);

    if (keys.length === 3 && ['s', 'e', 'd'].every((key) => keys.includes(key))) {
      return [path || '<root>'];
    }

    return keys.flatMap((key) => findDecimalLike(record[key], path ? `${path}.${key}` : key));
  }
  return [];
}

function createPrismaMock(): { metric: { findMany: jest.Mock }; adPlan: { findMany: jest.Mock } } {
  return { metric: { findMany: jest.fn() }, adPlan: { findMany: jest.fn() } };
}

function createRepository(prisma = createPrismaMock()): {
  repository: DashboardRepository;
  prisma: { metric: { findMany: jest.Mock }; adPlan: { findMany: jest.Mock } };
} {
  return {
    repository: new DashboardRepository(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('DashboardRepository', () => {
  it('findAllFacts 只按闭区间过滤，并把 Decimal / Date 转成 number / YYYY-MM-DD', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([createRow()]);

    const facts = await repository.findAllFacts(RANGE.from, RANGE.to);

    expect(prisma.metric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date(Date.UTC(2026, 8, 7)),
            lte: new Date(Date.UTC(2026, 8, 20)),
          },
        },
        orderBy: [{ date: 'asc' }, { planId: 'asc' }],
      }),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0].spend).toBe(1234.56);
    expect(facts[0].revenue).toBe(2345.67);
    expect(typeof facts[0].spend).toBe('number');
    expect(facts[0].date).toBe('2026-09-20');
    expect(facts[0].channel).toBe('douyin');
    expect(facts[0].status).toBe('active');
    expect(facts[0].planName).toBe('抖音-秋季上新-信息流');
  });

  it('findAllFacts 不带任何计划级筛选（渠道/计划在引擎里过滤）', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([]);

    await repository.findAllFacts(RANGE.from, RANGE.to);

    const where = prisma.metric.findMany.mock.calls[0][0].where;
    expect(Object.keys(where)).toEqual(['date']);
  });

  it('findPlanRecords 把计划级筛选下推到 SQL', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([]);

    await repository.findPlanRecords(RANGE.from, RANGE.to, {
      planId: 'p-101',
      channels: ['douyin', 'baidu'],
      statuses: ['active'],
      keyword: '  上新  ',
    });

    expect(prisma.metric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date(Date.UTC(2026, 8, 7)),
            lte: new Date(Date.UTC(2026, 8, 20)),
          },
          plan: {
            planId: 'p-101',
            channel: { in: ['douyin', 'baidu'] },
            status: { in: ['active'] },
            planName: { contains: '上新', mode: 'insensitive' },
          },
        },
      }),
    );
  });

  it('findPlanRecords 空筛选项等价于不筛选', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([]);

    await repository.findPlanRecords(RANGE.from, RANGE.to, {
      channels: [],
      statuses: [],
      keyword: '   ',
    });

    const where = prisma.metric.findMany.mock.calls[0][0].where;
    expect(where.plan).toBeUndefined();
  });

  it('契约外的 channel / status 直接抛错，不静默流进聚合', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([createRow({ channel: 'weibo' })]);

    await expect(repository.findAllFacts(RANGE.from, RANGE.to)).rejects.toThrow(
      '不在 AD_CHANNELS 契约内',
    );

    prisma.metric.findMany.mockResolvedValue([createRow({ status: 'archived' })]);
    await expect(repository.findAllFacts(RANGE.from, RANGE.to)).rejects.toThrow(
      '不在 AD_PLAN_STATUSES 契约内',
    );
  });

  it('Decimal 不泄漏：真实 Repository + 真实 Service 产出的 overview JSON 里没有 Decimal 形态', async () => {
    const { repository, prisma } = createRepository();
    prisma.metric.findMany.mockResolvedValue([
      createRow({ spend: '1000.55', revenue: '2000.66' }),
      createRow({
        planId: 'p-201',
        date: new Date(Date.UTC(2026, 8, 19)),
        spend: '0.10',
        revenue: '0.20',
        planName: '快手-新品首发',
        channel: 'kuaishou',
        status: 'active',
      }),
    ]);

    const service = new DashboardService(repository, new MemoryCacheService(), new ConfigService({}));
    const overview = await service.getOverview(RANGE);
    const json = JSON.stringify(overview);

    expect(overview.metrics.spend).toBe(1000.65);
    expect(overview.metrics.revenue).toBe(2000.86);
    expect(findDecimalLike(overview)).toEqual([]);
    expect(json).not.toMatch(/"s":\s*-?\d+/);
    expect(json).not.toContain('toNumber');
  });
});
