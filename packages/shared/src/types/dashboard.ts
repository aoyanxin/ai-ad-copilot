/**
 * 广告数据看板的跨端契约：前端 mock 数据与后端接口共用同一份类型与常量，
 * 保证 Day2 的前端 mock 可以被真实 API 平滑替换。
 *
 * 口径约定：
 * - 金额单位统一为元
 * - ctr / cvr 返回比值（0.0342 表示 3.42%），百分比格式化由前端负责
 * - 日期为 YYYY-MM-DD 的闭区间，业务日切按 Asia/Shanghai
 */

import type { PageQuery, PageResult } from './api';

/** 支持的投放渠道 */
export const AD_CHANNELS = ['douyin', 'kuaishou', 'tencent', 'baidu', 'xiaohongshu'] as const;

export type AdChannel = (typeof AD_CHANNELS)[number];

/** 广告计划状态 */
export const AD_PLAN_STATUSES = ['active', 'paused', 'ended'] as const;

export type AdPlanStatus = (typeof AD_PLAN_STATUSES)[number];

/** 转化漏斗阶段，数组顺序即漏斗顺序 */
export const FUNNEL_STAGE_KEYS = ['impression', 'click', 'conversion', 'order'] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number];

/** 明细表允许排序的字段，避免前端传入任意字段 */
export const AD_RECORD_SORT_FIELDS = [
  'spend',
  'revenue',
  'clicks',
  'conversions',
  'ctr',
  'cvr',
  'roi',
  'updatedAt',
] as const;

export type AdRecordSortField = (typeof AD_RECORD_SORT_FIELDS)[number];

export type SortOrder = 'asc' | 'desc';

/** 看板默认查询区间（天） */
export const DASHBOARD_DEFAULT_RANGE_DAYS = 14;

/** 单次查询允许的最大区间（天），前后端保持一致 */
export const DASHBOARD_MAX_RANGE_DAYS = 90;

/** 看板筛选条件，同时也是 mock 与真实接口的公共查询入参 */
export interface DashboardQuery {
  /** 起始日期（含），YYYY-MM-DD */
  from: string;
  /** 结束日期（含），YYYY-MM-DD */
  to: string;
  /** 渠道，空数组或省略表示全部渠道 */
  channels?: AdChannel[];
  /** 单个广告计划 ID，省略表示不限 */
  planId?: string;
}

/** 指标汇总，概览、渠道对比共用同一份口径 */
export interface MetricSummary {
  /** 消耗（元） */
  spend: number;
  /** 收入（元） */
  revenue: number;
  /** 曝光 */
  impressions: number;
  /** 点击 */
  clicks: number;
  /** 转化 */
  conversions: number;
  /** 点击率，0~1 */
  ctr: number;
  /** 转化率，0~1 */
  cvr: number;
  /** 投入产出比，revenue / spend */
  roi: number;
}

/** 趋势图单日数据点 */
export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  clicks: number;
  conversions: number;
}

/** 渠道对比：指标汇总 + 渠道标识 */
export type ChannelMetric = MetricSummary & { channel: AdChannel };

/** 漏斗阶段：value 为绝对值，rate 为相对上一阶段的转化率 */
export interface FunnelStage {
  key: FunnelStageKey;
  value: number;
  rate: number;
}

/** GET /api/dashboard/overview 响应数据 */
export interface DashboardOverview {
  /** 服务端回显的实际生效条件，便于前端校验 */
  query: DashboardQuery;
  metrics: MetricSummary;
  /** 等长上一周期指标，用于环比；无对照期时为 null */
  previous: MetricSummary | null;
  /** 按天趋势，日期连续无空洞 */
  trend: TrendPoint[];
  channels: ChannelMetric[];
  funnel: FunnelStage[];
  /** 数据截止时间（ISO 字符串） */
  updatedAt: string;
}

/** 广告计划明细行（表格展示的是区间聚合结果） */
export interface AdPlanRecord {
  planId: string;
  planName: string;
  channel: AdChannel;
  status: AdPlanStatus;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
  roi: number;
  updatedAt: string;
}

/** 广告计划下拉选项 */
export interface AdPlanOption {
  planId: string;
  planName: string;
  channel: AdChannel;
  status: AdPlanStatus;
}

/** GET /api/ad-plans 查询参数 */
export interface AdPlanQuery {
  channels?: AdChannel[];
  statuses?: AdPlanStatus[];
  /** 计划名模糊搜索 */
  keyword?: string;
}

/** GET /api/dashboard/records 查询参数：筛选 + 分页 + 排序 + 列筛选 */
export interface DashboardRecordsQuery extends DashboardQuery, PageQuery {
  sortField?: AdRecordSortField;
  sortOrder?: SortOrder;
  /** 列筛选：状态多选 */
  statuses?: AdPlanStatus[];
  /** 列筛选：计划名模糊搜索 */
  keyword?: string;
}

/** GET /api/dashboard/records 响应数据 */
export type DashboardRecordsResponse = PageResult<AdPlanRecord>;

export function isAdChannel(value: unknown): value is AdChannel {
  return typeof value === 'string' && (AD_CHANNELS as readonly string[]).includes(value);
}

export function isAdPlanStatus(value: unknown): value is AdPlanStatus {
  return typeof value === 'string' && (AD_PLAN_STATUSES as readonly string[]).includes(value);
}

export function isAdRecordSortField(value: unknown): value is AdRecordSortField {
  return typeof value === 'string' && (AD_RECORD_SORT_FIELDS as readonly string[]).includes(value);
}
