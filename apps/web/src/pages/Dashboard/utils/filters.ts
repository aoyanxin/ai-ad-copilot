/**
 * 看板筛选的纯逻辑：默认区间、区间纠偏、渠道与计划的联动校验、查询参数拼装。
 * 组件只负责渲染与事件绑定，所有可测规则集中在这里。
 */

import {
  AD_CHANNELS,
  DASHBOARD_DEFAULT_RANGE_DAYS,
  DASHBOARD_MAX_RANGE_DAYS,
  isAdPlanStatus,
  isAdRecordSortField,
  type AdChannel,
  type AdPlanOption,
  type AdPlanStatus,
  type AdRecordSortField,
  type DashboardQuery,
  type DashboardRecordsQuery,
  type SortOrder,
} from '@ai-ad-copilot/shared';

import { getDefaultDateRange, getTodayKey, normalizeDateRange } from '../../../utils/date';

/** 看板筛选态：channels 为空数组表示"全部渠道" */
export interface DashboardFilter {
  from: string;
  to: string;
  channels: AdChannel[];
  /** 选中的广告计划（存整个选项，便于渠道变化后判断是否需要清空） */
  plan: AdPlanOption | null;
}

/** 明细表的服务端态：分页 + 排序 + 列筛选 */
export interface AdRecordTableState {
  page: number;
  pageSize: number;
  sortField?: AdRecordSortField;
  sortOrder?: SortOrder;
  statuses: AdPlanStatus[];
  keyword: string;
}

export const DEFAULT_TABLE_STATE: AdRecordTableState = {
  page: 1,
  pageSize: 10,
  statuses: [],
  keyword: '',
};

export function createDefaultFilter(todayKey: string = getTodayKey()): DashboardFilter {
  const range = getDefaultDateRange(todayKey, DASHBOARD_DEFAULT_RANGE_DAYS);
  return { from: range.from, to: range.to, channels: [], plan: null };
}

/** 渠道去重并固定为 AD_CHANNELS 声明顺序，避免点击顺序不同导致查询 key 抖动 */
export function sortChannels(channels: readonly AdChannel[]): AdChannel[] {
  const selected = new Set(channels);
  return AD_CHANNELS.filter((channel) => selected.has(channel));
}

/** 勾选/取消渠道，返回规范化后的渠道数组 */
export function toggleChannel(
  channels: readonly AdChannel[],
  channel: AdChannel,
  checked?: boolean,
): AdChannel[] {
  const selected = new Set(channels);
  const shouldSelect = checked ?? !selected.has(channel);
  if (shouldSelect) {
    selected.add(channel);
  } else {
    selected.delete(channel);
  }
  return sortChannels([...selected]);
}

/**
 * 渠道变化后计划可能落到未选中的渠道上，此时必须清空，
 * 否则用户会看到"筛选条件自相矛盾导致的空结果"。
 */
export function reconcilePlanSelection(
  channels: readonly AdChannel[],
  plan: AdPlanOption | null,
): AdPlanOption | null {
  if (!plan || channels.length === 0) {
    return plan;
  }
  return channels.includes(plan.channel) ? plan : null;
}

/** 写入 store 前统一纠偏日期区间 */
export function normalizeFilter(
  filter: DashboardFilter,
  todayKey: string = getTodayKey(),
): DashboardFilter {
  const range = normalizeDateRange(
    filter.from,
    filter.to,
    DASHBOARD_MAX_RANGE_DAYS,
    todayKey,
    DASHBOARD_DEFAULT_RANGE_DAYS,
  );
  return { ...filter, from: range.from, to: range.to };
}

/** 筛选态 -> 概览/图表查询参数；空渠道与未选计划不进入 query */
export function toDashboardQuery(filter: DashboardFilter): DashboardQuery {
  const query: DashboardQuery = { from: filter.from, to: filter.to };
  const channels = sortChannels(filter.channels);

  if (channels.length > 0) {
    query.channels = channels;
  }
  if (filter.plan) {
    query.planId = filter.plan.planId;
  }

  return query;
}

/** 基础查询 + 表格服务端态 -> 明细表查询参数 */
export function mergeRecordsQuery(
  base: DashboardQuery,
  table: AdRecordTableState,
): DashboardRecordsQuery {
  const query: DashboardRecordsQuery = {
    ...base,
    page: table.page,
    pageSize: table.pageSize,
  };

  if (table.sortField) {
    query.sortField = table.sortField;
    query.sortOrder = table.sortOrder ?? 'desc';
  }
  if (table.statuses.length > 0) {
    query.statuses = sortStatuses(table.statuses);
  }

  const keyword = table.keyword.trim();
  if (keyword) {
    query.keyword = keyword;
  }

  return query;
}

/** 筛选态 + 表格态 -> 明细表查询参数 */
export function toRecordsQuery(
  filter: DashboardFilter,
  table: AdRecordTableState,
): DashboardRecordsQuery {
  return mergeRecordsQuery(toDashboardQuery(filter), table);
}

function sortStatuses(statuses: readonly AdPlanStatus[]): AdPlanStatus[] {
  const order: AdPlanStatus[] = ['active', 'paused', 'ended'];
  const selected = new Set(statuses);
  return order.filter((status) => selected.has(status));
}

/** antd Table onChange 的归一化输入 */
export interface TableChangeInput {
  page?: number;
  pageSize?: number;
  /** sorter 的 columnKey，必须通过 shared 白名单校验后才写入查询 */
  sorterField?: string;
  sorterOrder?: 'ascend' | 'descend' | null;
  statuses?: string[];
  keyword?: string;
}

function isSameSelection<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

/**
 * 表格交互 -> 表格服务端态：
 * - 排序字段走白名单，避免任意字段注入
 * - 列筛选变化时回到第一页，否则用户会看到"筛选后第 3 页为空"的错觉
 */
export function resolveTableState(
  current: AdRecordTableState,
  change: TableChangeInput,
): AdRecordTableState {
  // 只有表格回传了排序信息时才改动排序；列筛选/翻页不会误清排序
  const hasSorterInput = 'sorterField' in change || 'sorterOrder' in change;
  const nextSortField = isAdRecordSortField(change.sorterField) ? change.sorterField : undefined;
  const nextSortOrder =
    change.sorterOrder === 'ascend' ? 'asc' : change.sorterOrder === 'descend' ? 'desc' : undefined;
  const hasValidSorter = Boolean(nextSortField && nextSortOrder);

  const sortField = hasSorterInput ? (hasValidSorter ? nextSortField : undefined) : current.sortField;
  const sortOrder = hasSorterInput ? (hasValidSorter ? nextSortOrder : undefined) : current.sortOrder;

  const statuses = sortStatuses((change.statuses ?? current.statuses).filter(isAdPlanStatus));
  const keyword = change.keyword ?? current.keyword;
  const filtersChanged =
    !isSameSelection(statuses, current.statuses) || keyword !== current.keyword;

  return {
    page: filtersChanged ? 1 : (change.page ?? current.page),
    pageSize: change.pageSize ?? current.pageSize,
    sortField,
    sortOrder,
    statuses,
    keyword,
  };
}

/**
 * 稳定的查询 key，用于 useEffect/useMemo 依赖比较：
 * 渠道顺序不影响 key（筛选语义相同就不重复请求），日期与计划参与比较。
 */
export function toQueryKey(query: DashboardQuery): string {
  return [query.from, query.to, sortChannels(query.channels ?? []).join(','), query.planId ?? ''].join(
    '|',
  );
}

/** 明细表查询 key：在筛选 key 之上叠加分页、排序与列筛选 */
export function toRecordsQueryKey(query: DashboardRecordsQuery): string {
  return [
    toQueryKey(query),
    query.page,
    query.pageSize,
    query.sortField ?? '',
    query.sortOrder ?? '',
    (query.statuses ?? []).join(','),
    query.keyword ?? '',
  ].join('|');
}
