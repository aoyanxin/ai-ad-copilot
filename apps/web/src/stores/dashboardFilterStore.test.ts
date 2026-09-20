import type { AdPlanOption } from '@ai-ad-copilot/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultFilter } from '../pages/Dashboard/utils/filters';
import { useDashboardFilterStore } from './dashboardFilterStore';

const TODAY = '2026-09-20';

const douyinPlan: AdPlanOption = {
  planId: 'p-101',
  planName: '抖音-秋季上新-信息流',
  channel: 'douyin',
  status: 'active',
};

describe('useDashboardFilterStore', () => {
  beforeEach(() => {
    useDashboardFilterStore.setState({ filter: createDefaultFilter(TODAY) });
  });

  it('初始化默认筛选：最近 14 天、全部渠道、不限计划', () => {
    const { filter } = useDashboardFilterStore.getState();

    expect(filter.from).toBe('2026-09-07');
    expect(filter.to).toBe(TODAY);
    expect(filter.channels).toEqual([]);
    expect(filter.plan).toBeNull();
  });

  it('setFilter 写入前会纠偏区间', () => {
    useDashboardFilterStore
      .getState()
      .setFilter({ ...createDefaultFilter(TODAY), from: TODAY, to: '2026-09-18' });

    const { filter } = useDashboardFilterStore.getState();
    expect(filter.from).toBe('2026-09-18');
    expect(filter.to).toBe(TODAY);
  });

  it('setFilter 规范化渠道顺序并按渠道联动清空计划', () => {
    useDashboardFilterStore
      .getState()
      .setFilter({ ...createDefaultFilter(TODAY), channels: ['baidu', 'douyin', 'baidu'], plan: douyinPlan });

    let state = useDashboardFilterStore.getState().filter;
    expect(state.channels).toEqual(['douyin', 'baidu']);
    expect(state.plan).toEqual(douyinPlan);

    useDashboardFilterStore
      .getState()
      .setFilter({ ...createDefaultFilter(TODAY), channels: ['baidu'], plan: douyinPlan });
    state = useDashboardFilterStore.getState().filter;
    expect(state.channels).toEqual(['baidu']);
    expect(state.plan).toBeNull();
  });

  it('清空渠道（全部渠道）时保留已选计划', () => {
    useDashboardFilterStore
      .getState()
      .setFilter({ ...createDefaultFilter(TODAY), channels: [], plan: douyinPlan });

    expect(useDashboardFilterStore.getState().filter.plan).toEqual(douyinPlan);
  });

  it('setFilter 整体替换并纠偏，resetFilters 回到默认值', () => {
    useDashboardFilterStore.getState().setFilter({
      from: '2025-01-01',
      to: TODAY,
      channels: ['douyin'],
      plan: douyinPlan,
    });

    expect(useDashboardFilterStore.getState().filter.from).toBe('2026-06-23');

    useDashboardFilterStore.getState().resetFilters();
    expect(useDashboardFilterStore.getState().filter).toEqual(createDefaultFilter());
  });
});
