import { PrismaService } from '../../prisma/prisma.service';
import { AdPlansRepository } from './ad-plans.repository';

function createPrismaMock(): { adPlan: { findMany: jest.Mock } } {
  return { adPlan: { findMany: jest.fn() } };
}

function createRepository(prisma = createPrismaMock()): {
  repository: AdPlansRepository;
  prisma: { adPlan: { findMany: jest.Mock } };
} {
  return {
    repository: new AdPlansRepository(prisma as unknown as PrismaService),
    prisma,
  };
}

const ROW = {
  planId: 'p-101',
  planName: '抖音-秋季上新-信息流',
  channel: 'douyin',
  status: 'active',
};

describe('AdPlansRepository', () => {
  it('无筛选条件时不带 where 约束，只 select 契约字段', async () => {
    const { repository, prisma } = createRepository();
    prisma.adPlan.findMany.mockResolvedValue([ROW]);

    const plans = await repository.findAdPlans({});

    expect(prisma.adPlan.findMany).toHaveBeenCalledWith({
      where: {},
      select: { planId: true, planName: true, channel: true, status: true },
      orderBy: { planId: 'asc' },
    });
    expect(plans).toEqual([ROW]);
  });

  it('渠道 / 状态 / 关键字都下推到 where，关键字 trim 后模糊匹配', async () => {
    const { repository, prisma } = createRepository();
    prisma.adPlan.findMany.mockResolvedValue([]);

    await repository.findAdPlans({
      channels: ['douyin', 'baidu'],
      statuses: ['active', 'paused'],
      keyword: '  上新  ',
    });

    expect(prisma.adPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel: { in: ['douyin', 'baidu'] },
          status: { in: ['active', 'paused'] },
          planName: { contains: '上新', mode: 'insensitive' },
        },
      }),
    );
  });

  it('空数组与空白关键字不产生约束', async () => {
    const { repository, prisma } = createRepository();
    prisma.adPlan.findMany.mockResolvedValue([]);

    await repository.findAdPlans({ channels: [], statuses: [], keyword: '   ' });

    expect(prisma.adPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('只返回 AdPlanOption 的四个字段', async () => {
    const { repository, prisma } = createRepository();
    prisma.adPlan.findMany.mockResolvedValue([{ ...ROW, metrics: [], extra: 'ignored' }]);

    const [plan] = await repository.findAdPlans({});

    expect(Object.keys(plan).sort()).toEqual(['channel', 'planId', 'planName', 'status']);
  });

  it('契约外的 channel / status 直接抛错', async () => {
    const { repository, prisma } = createRepository();
    prisma.adPlan.findMany.mockResolvedValue([{ ...ROW, channel: 'weibo' }]);

    await expect(repository.findAdPlans({})).rejects.toThrow('不在 AD_CHANNELS 契约内');
  });
});
