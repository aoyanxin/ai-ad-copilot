/**
 * 图表 option 构造器：纯函数，输入数据输出 option，不依赖 DOM 与 echarts 运行时，
 * 因此可以脱离浏览器直接单测（图表渲染本身由 BaseChart 的测试覆盖）。
 */

import type { AdChannel, ChannelMetric, FunnelStage, TrendPoint } from '@ai-ad-copilot/shared';

import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from '../../utils/format';
import { CHART_COLORS, CHART_GRID } from './constants';
import type { ChartOption } from './types';

/** 消耗 / 点击趋势（双 Y 轴折线） */
export function buildTrendOption(trend: TrendPoint[]): ChartOption {
  return {
    color: [CHART_COLORS.spend, CHART_COLORS.clicks],
    tooltip: { trigger: 'axis' },
    legend: { data: ['消耗', '点击'], top: 0, right: 0 },
    grid: CHART_GRID,
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((point) => point.date),
      axisLabel: { hideOverlap: true },
    },
    yAxis: [
      {
        type: 'value',
        name: '消耗(元)',
        nameTextStyle: { color: CHART_COLORS.spend },
        axisLabel: { formatter: (value: number) => formatInteger(value) },
      },
      {
        type: 'value',
        name: '点击',
        nameTextStyle: { color: CHART_COLORS.clicks },
        axisLabel: { formatter: (value: number) => formatInteger(value) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '消耗',
        type: 'line',
        smooth: true,
        showSymbol: false,
        yAxisIndex: 0,
        data: trend.map((point) => point.spend),
        areaStyle: { opacity: 0.12 },
        tooltip: { valueFormatter: (value: number) => formatCurrency(value) },
      },
      {
        name: '点击',
        type: 'line',
        smooth: true,
        showSymbol: false,
        yAxisIndex: 1,
        data: trend.map((point) => point.clicks),
        tooltip: { valueFormatter: (value: number) => formatInteger(value) },
      },
    ],
  };
}

/** 渠道对比（消耗 / 收入分组柱状） */
export function buildChannelBarOption(
  channels: ChannelMetric[],
  channelLabels: Record<AdChannel, string>,
): ChartOption {
  return {
    color: [CHART_COLORS.spend, CHART_COLORS.revenue],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['消耗', '收入'], top: 0, right: 0 },
    grid: CHART_GRID,
    xAxis: {
      type: 'category',
      data: channels.map((item) => channelLabels[item.channel]),
    },
    yAxis: {
      type: 'value',
      name: '金额(元)',
      axisLabel: { formatter: (value: number) => formatInteger(value) },
    },
    series: [
      {
        name: '消耗',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: channels.map((item) => item.spend),
        tooltip: { valueFormatter: (value: number) => formatCurrency(value) },
      },
      {
        name: '收入',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: channels.map((item) => item.revenue),
        tooltip: { valueFormatter: (value: number) => formatCurrency(value) },
      },
    ],
  };
}

interface FunnelLabelParams {
  name?: string;
  value?: number;
  data?: { rate?: number | null };
}

/** 转化漏斗（曝光 -> 点击 -> 转化 -> 成交） */
export function buildFunnelOption(
  stages: FunnelStage[],
  stageLabels: Record<FunnelStage['key'], string>,
): ChartOption {
  return {
    color: [...CHART_COLORS.funnel],
    tooltip: { trigger: 'item' },
    series: [
      {
        name: '转化漏斗',
        type: 'funnel',
        left: '8%',
        width: '84%',
        top: 8,
        bottom: 8,
        minSize: '18%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          formatter: (params: FunnelLabelParams) => {
            const rate = params.data?.rate;
            const rateLabel = typeof rate === 'number' ? `（${formatPercent(rate)}）` : '';
            return `${params.name ?? ''} ${formatInteger(params.value ?? 0)}${rateLabel}`;
          },
        },
        emphasis: { label: { fontSize: 14 } },
        data: stages.map((stage, index) => ({
          name: stageLabels[stage.key],
          value: stage.value,
          rate: index === 0 ? null : stage.rate,
        })),
      },
    ],
  };
}
