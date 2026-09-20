import { Alert, Button, Empty } from 'antd';
import { useEffect, useRef } from 'react';

import { CHART_DEFAULT_HEIGHT } from './constants';
import { echarts, type ECharts, type EChartsCoreOption } from './echartsSetup';
import type { ChartOption } from './types';

export interface BaseChartProps {
  option: ChartOption;
  /** 图表高度（px） */
  height?: number;
  loading?: boolean;
  /** 错误文案，非空时展示错误态与重试入口 */
  error?: string | null;
  /** 数据为空时展示空态，而不是空白画布 */
  empty?: boolean;
  emptyText?: string;
  renderer?: 'canvas' | 'svg';
  /** 无障碍标签，同时便于测试定位图表容器 */
  ariaLabel?: string;
  onRetry?: () => void;
  testId?: string;
}

/**
 * 通用 ECharts 容器：统一负责实例生命周期、resize、loading 与空/错状态。
 * 具体图表组件只提供 option，不再关心 echarts 细节。
 */
export function BaseChart({
  option,
  height = CHART_DEFAULT_HEIGHT,
  loading = false,
  error = null,
  empty = false,
  emptyText = '暂无数据',
  renderer = 'canvas',
  ariaLabel = '数据图表',
  onRetry,
  testId = 'base-chart',
}: BaseChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const shouldRenderChart = !error && !empty;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !shouldRenderChart) {
      return;
    }

    const instance = echarts.init(container, undefined, { renderer });
    chartRef.current = instance;
    instance.setOption(option as unknown as EChartsCoreOption, { notMerge: true });

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container);

    // React 18 StrictMode 会双次挂载，这里必须成对 dispose，避免残留实例与内存泄漏
    return () => {
      observer.disconnect();
      instance.dispose();
      chartRef.current = null;
    };
    // option 的更新由下面的 effect 负责，这里只在容器/渲染器/状态切换时重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRenderChart, renderer]);

  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) {
      return;
    }
    instance.setOption(option as unknown as EChartsCoreOption, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) {
      return;
    }
    if (loading) {
      instance.showLoading('default', { text: '加载中' });
    } else {
      instance.hideLoading();
    }
  }, [loading, shouldRenderChart]);

  if (error) {
    return (
      <div
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        data-testid={`${testId}-error`}
      >
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            onRetry ? (
              <Button size="small" onClick={onRetry}>
                重试
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (empty) {
    return (
      <div
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        data-testid={`${testId}-empty`}
      >
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{ width: '100%', height }}
    />
  );
}
