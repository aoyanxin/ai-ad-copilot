/**
 * seed 数据生成器：Day2 前端 mock（apps/web/src/services/mock/dashboardData.ts）的服务端版本。
 *
 * 纯函数、不依赖 Prisma：同样的 (计划 + 日期) 永远产出同样的数值，
 * 保证 seed 可重复、单测可断言、演示数据稳定。
 * 生成规则与 web mock 完全一致（同 mulberry32 + FNV 种子、同渠道因子、
 * ended 计划数据截止到区间终点前 12 天），因此同一窗口下两端数据可以逐值对齐。
 */

import {
  AD_CHANNELS,
  type AdChannel,
  type AdPlanOption,
  type AdPlanStatus,
} from '@ai-ad-copilot/shared';

import { addDays, eachDateKey, type DateRange } from '../../common/utils/date';

/** 一天的投放事实：一天一个广告计划一行 */
export interface DailyFact {
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

export interface SeedDataset {
  /** 数据窗口（闭区间） */
  range: DateRange;
  plans: AdPlanOption[];
  facts: DailyFact[];
}

/** seed 覆盖的窗口长度（天） */
export const SEED_RANGE_DAYS = 90;

/** 已结束计划的数据截止到区间终点前 N 天，用于验证"部分计划无数据"的场景 */
export const ENDED_PLAN_CUTOFF_DAYS = 12;

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

/** 全部 seed 广告计划（30 条：5 渠道 × 6 计划） */
export function buildSeedPlans(): AdPlanOption[] {
  return AD_CHANNELS.flatMap((channel, channelIndex) =>
    CHANNEL_PLAN_NAMES[channel].map((planName, planIndex) => ({
      planId: `p-${channelIndex + 1}${String(planIndex + 1).padStart(2, '0')}`,
      planName,
      channel,
      status: resolvePlanStatus(channelIndex * 10 + planIndex),
    })),
  );
}

/** 以 todayKey 结尾、长度为 days 的闭区间 */
export function resolveSeedRange(todayKey: string, days: number = SEED_RANGE_DAYS): DateRange {
  return { from: addDays(todayKey, -(days - 1)), to: todayKey };
}

/** 按区间生成事实表：每天每计划一行，ended 计划在截止日之后没有数据 */
export function buildSeedFacts(from: string, to: string): DailyFact[] {
  const dates = eachDateKey(from, to);
  if (dates.length === 0) {
    throw new Error(`非法的 seed 区间：${from} ~ ${to}`);
  }

  const endedCutoff = addDays(to, -ENDED_PLAN_CUTOFF_DAYS);
  const facts: DailyFact[] = [];

  buildSeedPlans().forEach((plan) => {
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

/** 生成完整 seed 数据集：窗口 + 计划 + 事实表 */
export function buildSeedDataset(
  todayKey: string,
  days: number = SEED_RANGE_DAYS,
): SeedDataset {
  const range = resolveSeedRange(todayKey, days);
  return {
    range,
    plans: buildSeedPlans(),
    facts: buildSeedFacts(range.from, range.to),
  };
}
