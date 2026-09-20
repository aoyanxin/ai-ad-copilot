import { AD_CHANNELS, type AdPlanOption } from '@ai-ad-copilot/shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TABLE_STATE,
  createDefaultFilter,
  mergeRecordsQuery,
  normalizeFilter,
  reconcilePlanSelection,
  resolveTableState,
  sortChannels,
  toDashboardQuery,
  toQueryKey,
  toRecordsQuery,
  toggleChannel,
} from './filters';

const TODAY = '2026-09-20';

function createPlan(overrides: Partial<AdPlanOption> = {}): AdPlanOption {
  return {
    planId: 'p-1001',
    planName: '秋季上新-抖音',
    channel: 'douyin',
    status: 'active',
    ...overrides,
  };
}

describe('createDefaultFilter', () => {
  it('默认最近 14 天、全部渠道、不限计划', () => {
    const filter = createDefaultFilter(TODAY);

    expect(filter.from).toBe('2026-09-07');
    expect(filter.to).toBe(TODAY);
    expect(filter.channels).toEqual([]);
    expect(filter.plan).toBeNull();
  });
});

describe('渠道筛选', () => {
  it('sortChannels 去重并固定声明顺序', () => {
    expect(sortChannels(['baidu', 'douyin', 'baidu'])).toEqual(['douyin', 'baidu']);
    expect(sortChannels(AD_CHANNELS)).toEqual([...AD_CHANNELS]);
    expect(sortChannels([])).toEqual([]);
  });

  it('toggleChannel 支持勾选与取消', () => {
    expect(toggleChannel([], 'douyin')).toEqual(['douyin']);
    expect(toggleChannel(['douyin'], 'douyin')).toEqual([]);
    expect(toggleChannel(['baidu'], 'douyin', true)).toEqual(['douyin', 'baidu']);
    expect(toggleChannel(['douyin', 'baidu'], 'douyin', false)).toEqual(['baidu']);
  });
});

describe('渠道与计划联动', () => {
  it('未选渠道（全部渠道）时保留计划', () => {
    const plan = createPlan();
    expect(reconcilePlanSelection([], plan)).toEqual(plan);
  });

  it('计划渠道仍被选中时保留计划', () => {
    const plan = createPlan({ channel: 'kuaishou' });
    expect(reconcilePlanSelection(['douyin', 'kuaishou'], plan)).toEqual(plan);
  });

  it('计划渠道被移除时清空计划', () => {
    const plan = createPlan({ channel: 'baidu' });
    expect(reconcilePlanSelection(['douyin'], plan)).toBeNull();
  });

  it('未选计划时保持 null', () => {
    expect(reconcilePlanSelection(['douyin'], null)).toBeNull();
  });
});

describe('normalizeFilter', () => {
  it('起止颠倒时交换，超长区间收窄到上限', () => {
    const swapped = normalizeFilter({ ...createDefaultFilter(TODAY), from: TODAY, to: '2026-09-18' });
    expect(swapped.from).toBe('2026-09-18');
    expect(swapped.to).toBe(TODAY);

    const clamped = normalizeFilter({ ...createDefaultFilter(TODAY), from: '2025-01-01', to: TODAY });
    expect(clamped.from).toBe('2026-06-23');
    expect(clamped.to).toBe(TODAY);
  });

  it('非法日期回退到默认区间', () => {
    const filter = normalizeFilter({ ...createDefaultFilter(TODAY), from: '', to: '' }, TODAY);
    expect(filter.from).toBe('2026-09-07');
    expect(filter.to).toBe(TODAY);
  });
});

describe('toDashboardQuery', () => {
  it('空渠道与非选中计划不进入查询参数', () => {
    expect(toDashboardQuery(createDefaultFilter(TODAY))).toEqual({
      from: '2026-09-07',
      to: TODAY,
    });
  });

  it('渠道按声明顺序输出，选中计划带出 planId', () => {
    const query = toDashboardQuery({
      ...createDefaultFilter(TODAY),
      channels: ['baidu', 'douyin'],
      plan: createPlan({ planId: 'p-2002' }),
    });

    expect(query.channels).toEqual(['douyin', 'baidu']);
    expect(query.planId).toBe('p-2002');
  });

  it('toQueryKey 对渠道顺序不敏感，对日期与计划敏感', () => {
    const base = createDefaultFilter(TODAY);
    const left = toQueryKey(toDashboardQuery({ ...base, channels: ['douyin', 'baidu'] }));
    const right = toQueryKey(toDashboardQuery({ ...base, channels: ['baidu', 'douyin'] }));

    expect(left).toBe(right);
    expect(left).not.toBe(toQueryKey(toDashboardQuery({ ...base, from: '2026-09-01' })));
    expect(left).not.toBe(
      toQueryKey(toDashboardQuery({ ...base, channels: ['douyin', 'baidu'], plan: createPlan() })),
    );
  });
});

describe('toRecordsQuery', () => {
  it('默认分页参数进入查询', () => {
    const query = toRecordsQuery(createDefaultFilter(TODAY), DEFAULT_TABLE_STATE);

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(10);
    expect(query.sortField).toBeUndefined();
    expect(query.statuses).toBeUndefined();
    expect(query.keyword).toBeUndefined();
  });

  it('排序、列筛选与关键字映射到查询参数', () => {
    const query = toRecordsQuery(createDefaultFilter(TODAY), {
      page: 3,
      pageSize: 20,
      sortField: 'roi',
      sortOrder: 'asc',
      statuses: ['ended', 'active'],
      keyword: '  秋季  ',
    });

    expect(query.page).toBe(3);
    expect(query.pageSize).toBe(20);
    expect(query.sortField).toBe('roi');
    expect(query.sortOrder).toBe('asc');
    expect(query.statuses).toEqual(['active', 'ended']);
    expect(query.keyword).toBe('秋季');
  });

  it('排序字段缺省时使用默认降序，关键字为空白时不进入查询', () => {
    const query = toRecordsQuery(createDefaultFilter(TODAY), {
      ...DEFAULT_TABLE_STATE,
      sortField: 'spend',
      keyword: '   ',
    });

    expect(query.sortField).toBe('spend');
    expect(query.sortOrder).toBe('desc');
    expect(query.keyword).toBeUndefined();
  });
});

describe('mergeRecordsQuery', () => {
  it('基础查询与表格态合并，表格态覆盖分页参数', () => {
    const query = mergeRecordsQuery(
      { from: '2026-09-07', to: TODAY, channels: ['douyin'] },
      { ...DEFAULT_TABLE_STATE, page: 4, pageSize: 50, statuses: ['paused'], keyword: ' 快手 ' },
    );

    expect(query).toEqual({
      from: '2026-09-07',
      to: TODAY,
      channels: ['douyin'],
      page: 4,
      pageSize: 50,
      statuses: ['paused'],
      keyword: '快手',
    });
  });
});

describe('resolveTableState', () => {
  const base = { ...DEFAULT_TABLE_STATE, page: 3, pageSize: 20 };

  it('分页参数来自表格回调', () => {
    expect(resolveTableState(base, { page: 2, pageSize: 50 })).toMatchObject({
      page: 2,
      pageSize: 50,
    });
  });

  it('排序字段走白名单，非法字段被丢弃', () => {
    expect(resolveTableState(base, { sorterField: 'roi', sorterOrder: 'ascend' })).toMatchObject({
      sortField: 'roi',
      sortOrder: 'asc',
    });
    expect(resolveTableState(base, { sorterField: 'planName', sorterOrder: 'ascend' })).toMatchObject({
      sortField: undefined,
      sortOrder: undefined,
    });
  });

  it('取消排序时清空排序条件', () => {
    const sorted = resolveTableState(base, { sorterField: 'spend', sorterOrder: 'descend' });
    expect(sorted.sortOrder).toBe('desc');

    expect(resolveTableState(sorted, { sorterField: 'spend', sorterOrder: null })).toMatchObject({
      sortField: undefined,
      sortOrder: undefined,
    });
  });

  it('状态列筛选做白名单校验并按固定顺序输出', () => {
    const next = resolveTableState(base, { statuses: ['ended', 'active', 'unknown'] });

    expect(next.statuses).toEqual(['active', 'ended']);
  });

  it('列筛选或关键字变化时回到第一页', () => {
    expect(resolveTableState(base, { statuses: ['active'], page: 3 }).page).toBe(1);
    expect(resolveTableState(base, { keyword: '抖音', page: 3 }).page).toBe(1);
    expect(resolveTableState(base, { statuses: [], keyword: '' }).page).toBe(3);
  });

  it('关键字去除首尾空格后写入状态', () => {
    expect(resolveTableState(base, { keyword: '  抖音  ' }).keyword).toBe('  抖音  ');
    expect(mergeRecordsQuery({ from: '2026-09-01', to: TODAY }, resolveTableState(base, { keyword: ' 抖音 ' })).keyword).toBe('抖音');
  });
});
