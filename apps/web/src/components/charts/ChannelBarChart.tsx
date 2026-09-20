import type { AdChannel, ChannelMetric } from '@ai-ad-copilot/shared';
import { useMemo } from 'react';

import { CHART_DEFAULT_HEIGHT } from './constants';
import { BaseChart } from './BaseChart';
import { buildChannelBarOption } from './chartOptions';

export interface ChannelBarChartProps {
  data: ChannelMetric[];
  /** 渠道中文名，由页面注入，保证图表组件可复用 */
  channelLabels: Record<AdChannel, string>;
  loading?: boolean;
  error?: string | null;
  /** 覆盖默认空态判断 */
  empty?: boolean;
  height?: number;
  onRetry?: () => void;
}

/** 渠道对比柱状图 */
export function ChannelBarChart({
  data,
  channelLabels,
  loading = false,
  error = null,
  empty,
  height = CHART_DEFAULT_HEIGHT,
  onRetry,
}: ChannelBarChartProps) {
  const option = useMemo(() => buildChannelBarOption(data, channelLabels), [data, channelLabels]);
  const isEmpty = empty ?? (!loading && !error && data.length === 0);

  return (
    <BaseChart
      option={option}
      height={height}
      loading={loading}
      error={error}
      empty={isEmpty}
      emptyText="所选区间没有渠道数据"
      ariaLabel="渠道消耗与收入对比图"
      onRetry={onRetry}
      testId="channel-bar-chart"
    />
  );
}
