import type { AdChannel, AdPlanStatus, FunnelStageKey } from '@ai-ad-copilot/shared';

/** 渠道中文名（UI 文案留在前端，shared 只维护数据契约） */
export const CHANNEL_LABELS: Record<AdChannel, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  tencent: '腾讯广告',
  baidu: '百度',
  xiaohongshu: '小红书',
};

export const AD_PLAN_STATUS_LABELS: Record<AdPlanStatus, string> = {
  active: '投放中',
  paused: '已暂停',
  ended: '已结束',
};

export const AD_PLAN_STATUS_COLORS: Record<AdPlanStatus, string> = {
  active: 'green',
  paused: 'orange',
  ended: 'default',
};

export const FUNNEL_STAGE_LABELS: Record<FunnelStageKey, string> = {
  impression: '曝光',
  click: '点击',
  conversion: '转化',
  order: '成交',
};

/** 表格分页可选页长 */
export const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50];
