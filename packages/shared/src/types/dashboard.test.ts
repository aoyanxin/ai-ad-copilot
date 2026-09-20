import { describe, expect, it } from 'vitest';

import {
  AD_CHANNELS,
  AD_PLAN_STATUSES,
  AD_RECORD_SORT_FIELDS,
  DASHBOARD_DEFAULT_RANGE_DAYS,
  DASHBOARD_MAX_RANGE_DAYS,
  FUNNEL_STAGE_KEYS,
  isAdChannel,
  isAdPlanStatus,
  isAdRecordSortField,
} from './dashboard';

describe('dashboard 契约常量', () => {
  it('渠道与状态取值唯一且为非空字符串', () => {
    expect(new Set(AD_CHANNELS).size).toBe(AD_CHANNELS.length);
    expect(new Set(AD_PLAN_STATUSES).size).toBe(AD_PLAN_STATUSES.length);
    AD_CHANNELS.forEach((channel) => expect(channel.length).toBeGreaterThan(0));
    AD_PLAN_STATUSES.forEach((status) => expect(status.length).toBeGreaterThan(0));
  });

  it('漏斗阶段顺序为曝光 -> 点击 -> 转化 -> 成交', () => {
    expect([...FUNNEL_STAGE_KEYS]).toEqual(['impression', 'click', 'conversion', 'order']);
  });

  it('默认区间不超过最大区间，且最大区间为正数', () => {
    expect(DASHBOARD_DEFAULT_RANGE_DAYS).toBeGreaterThan(0);
    expect(DASHBOARD_MAX_RANGE_DAYS).toBeGreaterThan(DASHBOARD_DEFAULT_RANGE_DAYS);
  });

  it('明细表可排序字段包含 ROI 与更新时间', () => {
    expect(AD_RECORD_SORT_FIELDS).toContain('roi');
    expect(AD_RECORD_SORT_FIELDS).toContain('updatedAt');
  });
});

describe('dashboard 类型守卫', () => {
  it('isAdChannel 只接受合法渠道', () => {
    AD_CHANNELS.forEach((channel) => expect(isAdChannel(channel)).toBe(true));
    expect(isAdChannel('weibo')).toBe(false);
    expect(isAdChannel('')).toBe(false);
    expect(isAdChannel(undefined)).toBe(false);
    expect(isAdChannel(1)).toBe(false);
  });

  it('isAdPlanStatus 只接受合法状态', () => {
    AD_PLAN_STATUSES.forEach((status) => expect(isAdPlanStatus(status)).toBe(true));
    expect(isAdPlanStatus('archived')).toBe(false);
    expect(isAdPlanStatus(null)).toBe(false);
  });

  it('isAdRecordSortField 只接受白名单字段，避免任意字段注入', () => {
    AD_RECORD_SORT_FIELDS.forEach((field) => expect(isAdRecordSortField(field)).toBe(true));
    expect(isAdRecordSortField('planName')).toBe(false);
    expect(isAdRecordSortField({})).toBe(false);
  });
});
