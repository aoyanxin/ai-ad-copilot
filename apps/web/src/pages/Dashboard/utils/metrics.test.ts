import type { MetricSummary } from '@ai-ad-copilot/shared';
import { describe, expect, it } from 'vitest';

import { buildMetricCards } from './metrics';

const metrics: MetricSummary = {
  spend: 1234567.891,
  revenue: 2000000,
  impressions: 1000000,
  clicks: 42000,
  conversions: 3200,
  ctr: 0.042,
  cvr: 0.0762,
  roi: 1.62,
};

describe('buildMetricCards', () => {
  it('无数据时输出六个占位指标卡，避免 NaN 上屏', () => {
    const cards = buildMetricCards(null, null);

    expect(cards.map((card) => card.label)).toEqual(['消耗', '点击', '转化', 'CTR', 'CVR', 'ROI']);
    expect(cards.every((card) => card.value === '-')).toBe(true);
    expect(cards.every((card) => card.delta === null)).toBe(true);
  });

  it('按指标口径格式化消耗、计数、比率与 ROI', () => {
    const cards = buildMetricCards(metrics, null);
    const values = Object.fromEntries(cards.map((card) => [card.key, card.value]));

    expect(values.spend).toBe('¥123.46万');
    expect(values.clicks).toBe('4.2万');
    expect(values.conversions).toBe('3,200');
    expect(values.ctr).toBe('4.20%');
    expect(values.cvr).toBe('7.62%');
    expect(values.roi).toBe('1.62');
  });

  it('有对照期时计算环比，消耗上升视为变差', () => {
    const cards = buildMetricCards(metrics, { ...metrics, spend: 1000000, roi: 1.8 });
    const spend = cards.find((card) => card.key === 'spend');
    const roi = cards.find((card) => card.key === 'roi');

    expect(spend?.delta).toBeCloseTo(0.2346, 4);
    expect(spend?.positiveIsGood).toBe(false);
    expect(roi?.delta).toBeCloseTo(-0.1, 10);
    expect(roi?.positiveIsGood).toBe(true);
  });
});
