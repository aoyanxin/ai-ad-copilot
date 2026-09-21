import { AD_CHANNELS, AD_PLAN_STATUSES } from '@ai-ad-copilot/shared';

import { addDays, diffInDays, eachDateKey } from '../../common/utils/date';
import {
  ENDED_PLAN_CUTOFF_DAYS,
  SEED_RANGE_DAYS,
  buildSeedDataset,
  buildSeedFacts,
  buildSeedPlans,
  resolveSeedRange,
} from './seed-data';

const TODAY = '2026-09-20';

describe('buildSeedPlans', () => {
  it('生成 30 个计划，覆盖 5 个渠道且每渠道 6 个', () => {
    const plans = buildSeedPlans();

    expect(plans).toHaveLength(30);
    expect(new Set(plans.map((plan) => plan.channel))).toEqual(new Set(AD_CHANNELS));
    AD_CHANNELS.forEach((channel) => {
      expect(plans.filter((plan) => plan.channel === channel)).toHaveLength(6);
    });
  });

  it('planId 唯一，状态取自 shared 契约', () => {
    const plans = buildSeedPlans();

    expect(new Set(plans.map((plan) => plan.planId)).size).toBe(30);
    plans.forEach((plan) => {
      expect(plan.planId).toMatch(/^p-\d{3}$/);
      expect(AD_PLAN_STATUSES).toContain(plan.status);
    });
    // resolvePlanStatus 判定顺序：index % 11 === 0 -> ended，其次 index % 5 === 0 -> paused
    // 30 个计划的 index 为 channelIndex*10 + planIndex，落在 0/11/22/33/44 的 5 个为 ended
    expect(plans.filter((plan) => plan.status === 'ended')).toHaveLength(5);
    expect(plans.filter((plan) => plan.status === 'paused')).toHaveLength(9);
    expect(plans.filter((plan) => plan.status === 'active')).toHaveLength(16);
  });
});

describe('resolveSeedRange', () => {
  it('默认窗口为以今天结尾的 90 天闭区间', () => {
    const range = resolveSeedRange(TODAY);

    expect(range).toEqual({ from: '2026-06-23', to: TODAY });
    expect(diffInDays(range.from, range.to) + 1).toBe(SEED_RANGE_DAYS);
  });
});

describe('buildSeedFacts', () => {
  const plans = buildSeedPlans();
  const range = resolveSeedRange(TODAY);
  const facts = buildSeedFacts(range.from, range.to);
  const dates = eachDateKey(range.from, range.to);
  const endedCutoff = addDays(range.to, -ENDED_PLAN_CUTOFF_DAYS);

  it('区间内每天每计划一行（ended 计划截止后无数据）', () => {
    expect(dates).toHaveLength(SEED_RANGE_DAYS);
    // 16 个 active + 9 个 paused 覆盖满 90 天，5 个 ended 只覆盖截止日之前
    expect(facts).toHaveLength(16 * 90 + 9 * 90 + 5 * (90 - ENDED_PLAN_CUTOFF_DAYS));

    plans.forEach((plan) => {
      const planFacts = facts.filter((fact) => fact.planId === plan.planId);
      expect(planFacts).toHaveLength(plan.status === 'ended' ? 90 - 12 : 90);
    });
  });

  it('每天每计划最多一行，且日期都在区间内', () => {
    const seen = new Set(facts.map((fact) => `${fact.planId}|${fact.date}`));
    expect(seen.size).toBe(facts.length);

    facts.forEach((fact) => {
      expect(fact.date >= range.from && fact.date <= range.to).toBe(true);
    });
  });

  it('ended 计划数据正好截止到区间终点前 12 天', () => {
    const endedPlanIds = new Set(
      plans.filter((plan) => plan.status === 'ended').map((plan) => plan.planId),
    );
    const endedFacts = facts.filter((fact) => endedPlanIds.has(fact.planId));
    const latestEndedDate = endedFacts
      .map((fact) => fact.date)
      .reduce((latest, date) => (date > latest ? date : latest));

    expect(latestEndedDate).toBe(endedCutoff);
    expect(endedFacts.every((fact) => fact.date <= endedCutoff)).toBe(true);
    // 截止日之后确实存在"计划没有数据"的区间
    expect(diffInDays(endedCutoff, range.to)).toBe(ENDED_PLAN_CUTOFF_DAYS);
  });

  it('同窗口两次生成结果完全一致（种子化可复现）', () => {
    expect(buildSeedFacts(range.from, range.to)).toEqual(facts);
  });

  it('同一 (计划, 日期) 在不同窗口起点下数值不同，避免"看起来是假数据"', () => {
    // 公式里 growth 依赖"距窗口起点的天数"，因此窗口整体前移一天时，
    // 同一个 (计划, 日期) 会得到不同数值：筛选条件变化时数据是真的在变。
    const shifted = buildSeedFacts(addDays(range.from, -1), addDays(range.to, -1));
    const sample = facts.find((fact) => fact.date === range.from);
    const shiftedSample = shifted.find((fact) => fact.date === range.from);

    expect(sample).toBeDefined();
    expect(shiftedSample).toBeDefined();
    expect(shiftedSample?.spend).not.toBe(sample?.spend);
  });

  it('数值口径合理：不为负、漏斗逐级递减', () => {
    facts.forEach((fact) => {
      expect(fact.impressions).toBeGreaterThan(0);
      expect(fact.clicks).toBeGreaterThanOrEqual(0);
      expect(fact.clicks).toBeLessThanOrEqual(fact.impressions);
      expect(fact.conversions).toBeLessThanOrEqual(fact.clicks);
      expect(fact.orders).toBeLessThanOrEqual(fact.conversions);
      expect(fact.spend).toBeGreaterThanOrEqual(0);
      expect(fact.revenue).toBeGreaterThanOrEqual(0);
    });
  });

  it('非法区间抛错', () => {
    expect(() => buildSeedFacts('2026-09-20', '2026-09-01')).toThrow('非法的 seed 区间');
    expect(() => buildSeedFacts('2026-02-30', '2026-03-01')).toThrow('非法的 seed 区间');
  });
});

describe('buildSeedDataset', () => {
  it('返回窗口、计划与事实表', () => {
    const dataset = buildSeedDataset(TODAY);

    expect(dataset.range).toEqual({ from: '2026-06-23', to: TODAY });
    expect(dataset.plans).toHaveLength(30);
    expect(dataset.facts).toHaveLength(2640);
  });
});
