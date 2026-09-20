import type { FunnelStage } from '@ai-ad-copilot/shared';
import { useMemo } from 'react';

import { CHART_DEFAULT_HEIGHT } from './constants';
import { BaseChart } from './BaseChart';
import { buildFunnelOption } from './chartOptions';

export interface ConversionFunnelChartProps {
  data: FunnelStage[];
  /** 阶段中文名，由页面注入 */
  stageLabels: Record<FunnelStage['key'], string>;
  loading?: boolean;
  error?: string | null;
  /** 覆盖默认空态判断 */
  empty?: boolean;
  height?: number;
  onRetry?: () => void;
}

/** 转化漏斗图 */
export function ConversionFunnelChart({
  data,
  stageLabels,
  loading = false,
  error = null,
  empty,
  height = CHART_DEFAULT_HEIGHT,
  onRetry,
}: ConversionFunnelChartProps) {
  const option = useMemo(() => buildFunnelOption(data, stageLabels), [data, stageLabels]);
  const isEmpty = empty ?? (!loading && !error && data.every((stage) => stage.value === 0));

  return (
    <BaseChart
      option={option}
      height={height}
      loading={loading}
      error={error}
      empty={isEmpty}
      emptyText="所选区间没有转化数据"
      ariaLabel="转化漏斗图"
      onRetry={onRetry}
      testId="conversion-funnel-chart"
    />
  );
}
