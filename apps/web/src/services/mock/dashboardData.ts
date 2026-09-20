/**
 * 前端 mock 数据：种子化生成，同样的 (日期 + 计划) 永远产出同样的数值，
 * 保证单测可断言、演示截图稳定；筛选条件变化时数值会真实变化，不会"看起来是假数据"。
 *
 * 这里等价于后端数据仓库的事实表（一天一个计划一行），
 * 聚合口径全部在 queryEngine 中实现，未来可直接搬到服务端。
 */

import { AD_CHANNELS, type AdChannel, type AdPlanOption, type AdPlanStatus } from '@ai-ad-copilot/shared';

import { addDays, eachDateKey } from '../../utils/date';
import type { MockDailyFact } from './types';

/** 每个渠道的广告计划名，模拟真实的投放结构 */
const CHANNEL_PLAN_NAMES: Record<AdChannel, readonly string[]> = {
  douyin: [
    '抖音-秋季上新-信息流',
    '抖音-品牌曝光-开屏',
    '抖音-达人种草-短视频',
    '抖音-直播间引流',
    '抖音-爆品复投',
    '抖音-新客拉新',
  ],
  kuaishou: [
    '快手-直播切片',
    '快手-新品首发',
    '快手-老客召回',
    '快手-节日大促',
    '快手-短视频种草',
    '快手-粉丝增长',
  ],
  tencent: [
    '腾讯-朋友圈广告',
    '腾讯-视频号推广',
    '腾讯-公众号涨粉',
    '腾讯-小程序引流',
    '腾讯-节日大促',
    '腾讯-品牌专区',
  ],
  baidu: [
    '百度-搜索品牌词',
    '百度-搜索通用词',
    '百度-信息流推荐',
    '百度-品专直达',
    '百度-线索收集',
    '百度-再营销',
  ],
  xiaohongshu: [
    '小红书-笔记种草',
    '小红书-信息流',
    '小红书-搜索卡位',
    '小红书-达人合作',
    '小红书-店铺引流',
    '小红书-新品测评',
  ],
};

/** 渠道级差异：曝光规模、点击成本、客单价 */
const CHANNEL_FACTORS: Record<AdChannel, { impression: number; cpc: number; aov: number }> = {
  douyin: { impression: 1.35, cpc: 1.15, aov: 1.2 },
  kuaishou: { impression: 1.1, cpc: 0.95, aov: 1.0 },
  tencent: { impression: 0.9, cpc: 1.3, aov: 1.35 },
  baidu: { impression: 0.7, cpc: 1.05, aov: 0.95 },
  xiaohongshu: { impression: 0.8, cpc: 1.25, aov: 1.1 },
};

/** 已结束计划的数据截止到区间终点前 N 天，用于验证"部分计划无数据"的场景 */
const ENDED_PLAN_CUTOFF_DAYS = 12;

const FACTS_CACHE_LIMIT = 8;
const factsCache = new Map<string, MockDailyFact[]>();

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32：同一种子稳定复现 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isWeekend(dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function resolvePlanStatus(index: number): AdPlanStatus {
  if (index % 11 === 0) {
    return 'ended';
  }
  if (index % 5 === 0) {
    return 'paused';
  }
  return 'active';
}

function buildPlans(): AdPlanOption[] {
  return AD_CHANNELS.flatMap((channel, channelIndex) =>
    CHANNEL_PLAN_NAMES[channel].map((planName, planIndex) => ({
      planId: `p-${channelIndex + 1}${String(planIndex + 1).padStart(2, '0')}`,
      planName,
      channel,
      status: resolvePlanStatus(channelIndex * 10 + planIndex),
    })),
  );
}

/** 全部 mock 广告计划（30 条：5 渠道 × 6 计划） */
export const MOCK_PLANS: AdPlanOption[] = buildPlans();

function buildFacts(from: string, to: string): MockDailyFact[] {
  const dates = eachDateKey(from, to);
  const endedCutoff = addDays(to, -ENDED_PLAN_CUTOFF_DAYS);
  const facts: MockDailyFact[] = [];

  MOCK_PLANS.forEach((plan) => {
    const channelFactor = CHANNEL_FACTORS[plan.channel];

    dates.forEach((date, dayIndex) => {
      if (plan.status === 'ended' && date > endedCutoff) {
        return;
      }

      const random = createRandom(hashString(`${plan.planId}|${date}`));
      const weekendBoost = isWeekend(date) ? 1.18 : 1;
      const growth = 1 + dayIndex * 0.006;

      const impressions = Math.round(
        randomBetween(random, 8000, 42000) * channelFactor.impression * weekendBoost * growth,
      );
      const ctr = clamp(randomBetween(random, 0.012, 0.055), 0.004, 0.12);
      const clicks = Math.round(impressions * ctr);
      const cvr = clamp(randomBetween(random, 0.02, 0.14), 0.005, 0.3);
      const conversions = Math.round(clicks * cvr);
      const orderRate = clamp(randomBetween(random, 0.3, 0.72), 0.1, 0.95);
      const orders = Math.round(conversions * orderRate);
      const cpc = randomBetween(random, 0.55, 2.1) * channelFactor.cpc;
      const pausedFactor = plan.status === 'paused' ? 0.35 : 1;
      const spend = round2(clicks * cpc * pausedFactor);
      const aov = randomBetween(random, 48, 260) * channelFactor.aov;
      const revenue = round2(orders * aov);

      facts.push({
        date,
        planId: plan.planId,
        planName: plan.planName,
        channel: plan.channel,
        status: plan.status,
        impressions,
        clicks,
        conversions,
        orders,
        spend,
        revenue,
      });
    });
  });

  return facts;
}

/** 带缓存的 mock 事实表读取：区间是唯一入参，保证结果只与区间有关 */
export function getMockFacts(from: string, to: string): MockDailyFact[] {
  const cacheKey = `${from}~${to}`;
  const cached = factsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const facts = buildFacts(from, to);
  if (factsCache.size >= FACTS_CACHE_LIMIT) {
    const oldestKey = factsCache.keys().next().value;
    if (oldestKey !== undefined) {
      factsCache.delete(oldestKey);
    }
  }
  factsCache.set(cacheKey, facts);
  return facts;
}
