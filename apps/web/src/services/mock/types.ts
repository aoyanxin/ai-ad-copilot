import type { AdChannel, AdPlanStatus } from '@ai-ad-copilot/shared';

/**
 * mock 侧的"事实表"：一天一个广告计划一行。
 * 明细表/指标/图表都是在这张表上做聚合的结果，等价于后端真实数据仓库的粒度。
 */
export interface MockDailyFact {
  /** YYYY-MM-DD */
  date: string;
  planId: string;
  planName: string;
  channel: AdChannel;
  status: AdPlanStatus;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  spend: number;
  revenue: number;
}
