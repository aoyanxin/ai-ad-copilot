import type { TrendPoint } from '@ai-ad-copilot/shared';
import { useMemo } from 'react';

import { CHART_DEFAULT_HEIGHT } from './constants';
import { BaseChart } from './BaseChart';
import { buildTrendOption } from './chartOptions';

export interface TrendChartProps {
  data: TrendPoint[];
  loading?: boolean;
  error?: string | null;
  /** 覆盖默认空态判断（出错保留旧数据等场景） */
  empty?: boolean;
  height?: number;
  onRetry?: () => void;
}

/** 消耗 / 点击趋势折线图 */
export function TrendChart({
  data,
  loading = false,
  error = null,
  empty,
  height = CHART_DEFAULT_HEIGHT,
  onRetry,
}: TrendChartProps) {
  const option = useMemo(() => buildTrendOption(data), [data]);
  const isEmpty = empty ?? (!loading && !error && data.length === 0);

  return (
    <BaseChart
      option={option}
      height={height}
      loading={loading}
      error={error}
      empty={isEmpty}
      emptyText="所选区间没有投放数据"
      ariaLabel="消耗与点击趋势图"
      onRetry={onRetry}
      testId="trend-chart"
    />
  );
}
