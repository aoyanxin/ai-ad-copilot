import type { AdChannel, AdPlanOption, AdPlanStatus } from '@ai-ad-copilot/shared';

import { AdPlansService, compareAdPlanOptions } from './ad-plans.service';
import type { AdPlansRepository } from './ad-plans.repository';

function createPlan(planId: string, channel: AdChannel, status: AdPlanOption['status'] = 'active'): AdPlanOption {
  return { planId, planName: `${channel}-${planId}`, channel, status };
}

function createService(): { service: AdPlansService; repository: { findAdPlans: jest.Mock } } {
  const repository = { findAdPlans: jest.fn() };
  return {
    service: new AdPlansService(repository as unknown as AdPlansRepository),
    repository,
  };
}

describe('AdPlansService', () => {
  it('无论仓储返回什么顺序，都按 AD_CHANNELS 声明顺序 + planId 排序', async () => {
    const { service, repository } = createService();
    repository.findAdPlans.mockResolvedValue([
      createPlan('p-505', 'xiaohongshu'),
      createPlan('p-102', 'douyin'),
      createPlan('p-303', 'tencent'),
      createPlan('p-201', 'kuaishou'),
      createPlan('p-404', 'baidu'),
      createPlan('p-101', 'douyin'),
    ]);

    const result = await service.getAdPlans({});

    expect(result.map((plan) => plan.planId)).toEqual([
      'p-101',
      'p-102',
      'p-201',
      'p-303',
      'p-404',
      'p-505',
    ]);
    expect(result.map((plan) => plan.channel)).toEqual([
      'douyin',
      'douyin',
      'kuaishou',
      'tencent',
      'baidu',
      'xiaohongshu',
    ]);
  });

  it('渠道/状态/关键字筛选条件完整透传给仓储', async () => {
    const { service, repository } = createService();
    repository.findAdPlans.mockResolvedValue([]);
    const query = {
      channels: ['douyin', 'baidu'] as AdChannel[],
      statuses: ['active'] as AdPlanStatus[],
      keyword: '上新',
    };

    await service.getAdPlans(query);

    expect(repository.findAdPlans).toHaveBeenCalledWith(query);
  });

  it('空查询也走仓储（返回全部计划）', async () => {
    const { service, repository } = createService();
    repository.findAdPlans.mockResolvedValue([createPlan('p-101', 'douyin')]);

    expect(await service.getAdPlans()).toHaveLength(1);
    expect(repository.findAdPlans).toHaveBeenCalledWith({});
  });

  it('排序不改动仓储返回的数组本身', async () => {
    const { service, repository } = createService();
    const source = [createPlan('p-202', 'kuaishou'), createPlan('p-101', 'douyin')];
    repository.findAdPlans.mockResolvedValue(source);

    await service.getAdPlans({});

    expect(source.map((plan) => plan.planId)).toEqual(['p-202', 'p-101']);
  });
});

describe('compareAdPlanOptions', () => {
  it('同渠道内按 planId 升序', () => {
    const sorted = [createPlan('p-103', 'douyin'), createPlan('p-101', 'douyin')].sort(
      compareAdPlanOptions,
    );

    expect(sorted.map((plan) => plan.planId)).toEqual(['p-101', 'p-103']);
  });

  it('渠道顺序与 AD_CHANNELS 声明一致（baidu 不在最前）', () => {
    const sorted = [createPlan('p-404', 'baidu'), createPlan('p-101', 'douyin')].sort(
      compareAdPlanOptions,
    );

    expect(sorted.map((plan) => plan.channel)).toEqual(['douyin', 'baidu']);
  });
});
