import type { MetricSummary } from '@ai-ad-copilot/shared';

import {
  calcChangeRate,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRatio,
} from '../../../utils/format';

export interface MetricCardDescriptor {
  key: string;
  label: string;
  value: string;
  delta: number | null;
  /** 消耗类指标上升视为变差 */
  positiveIsGood: boolean;
}

const PLACEHOLDER = '-';

/**
 * 指标卡映射：口径集中在纯函数里，页面只负责排列。
 * metrics 为空时返回占位值，避免 loading / 空态下渲染 NaN。
 */
export function buildMetricCards(
  metrics: MetricSummary | null,
  previous: MetricSummary | null,
): MetricCardDescriptor[] {
  if (!metrics) {
    return [
      { key: 'spend', label: '消耗', value: PLACEHOLDER, delta: null, positiveIsGood: false },
      { key: 'clicks', label: '点击', value: PLACEHOLDER, delta: null, positiveIsGood: true },
      { key: 'conversions', label: '转化', value: PLACEHOLDER, delta: null, positiveIsGood: true },
      { key: 'ctr', label: 'CTR', value: PLACEHOLDER, delta: null, positiveIsGood: true },
      { key: 'cvr', label: 'CVR', value: PLACEHOLDER, delta: null, positiveIsGood: true },
      { key: 'roi', label: 'ROI', value: PLACEHOLDER, delta: null, positiveIsGood: true },
    ];
  }

  return [
    {
      key: 'spend',
      label: '消耗',
      value: formatCurrency(metrics.spend, { compact: true }),
      delta: calcChangeRate(metrics.spend, previous?.spend),
      positiveIsGood: false,
    },
    {
      key: 'clicks',
      label: '点击',
      value: formatNumber(metrics.clicks, { compact: true, digits: 1 }),
      delta: calcChangeRate(metrics.clicks, previous?.clicks),
      positiveIsGood: true,
    },
    {
      key: 'conversions',
      label: '转化',
      value: formatNumber(metrics.conversions, { compact: true, digits: 1 }),
      delta: calcChangeRate(metrics.conversions, previous?.conversions),
      positiveIsGood: true,
    },
    {
      key: 'ctr',
      label: 'CTR',
      value: formatPercent(metrics.ctr),
      delta: calcChangeRate(metrics.ctr, previous?.ctr),
      positiveIsGood: true,
    },
    {
      key: 'cvr',
      label: 'CVR',
      value: formatPercent(metrics.cvr),
      delta: calcChangeRate(metrics.cvr, previous?.cvr),
      positiveIsGood: true,
    },
    {
      key: 'roi',
      label: 'ROI',
      value: formatRatio(metrics.roi),
      delta: calcChangeRate(metrics.roi, previous?.roi),
      positiveIsGood: true,
    },
  ];
}
