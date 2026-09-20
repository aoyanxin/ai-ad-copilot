import type { ChannelMetric, FunnelStage, TrendPoint } from '@ai-ad-copilot/shared';
import { describe, expect, it } from 'vitest';

import { buildChannelBarOption, buildFunnelOption, buildTrendOption } from './chartOptions';

interface AxisOption {
  type?: string;
  data?: string[];
  axisLabel?: { formatter?: (value: number) => string };
}

interface SeriesOption {
  name?: string;
  type?: string;
  yAxisIndex?: number;
  data?: Array<number | { name: string; value: number; rate: number | null }>;
  label?: { formatter?: (params: unknown) => string };
}

interface OptionShape {
  color?: string[];
  xAxis?: AxisOption;
  yAxis?: AxisOption | AxisOption[];
  series?: SeriesOption[];
}

const trend: TrendPoint[] = [
  { date: '2026-09-19', spend: 1000, clicks: 100, conversions: 10 },
  { date: '2026-09-20', spend: 2000, clicks: 300, conversions: 30 },
];

const channels: ChannelMetric[] = [
  {
    channel: 'douyin',
    spend: 1000,
    revenue: 3000,
    impressions: 10000,
    clicks: 300,
    conversions: 30,
    ctr: 0.03,
    cvr: 0.1,
    roi: 3,
  },
  {
    channel: 'baidu',
    spend: 500,
    revenue: 800,
    impressions: 4000,
    clicks: 80,
    conversions: 4,
    ctr: 0.02,
    cvr: 0.05,
    roi: 1.6,
  },
];

const funnel: FunnelStage[] = [
  { key: 'impression', value: 10000, rate: 1 },
  { key: 'click', value: 300, rate: 0.03 },
  { key: 'conversion', value: 30, rate: 0.1 },
  { key: 'order', value: 12, rate: 0.4 },
];

const channelLabels = {
  douyin: '抖音',
  kuaishou: '快手',
  tencent: '腾讯广告',
  baidu: '百度',
  xiaohongshu: '小红书',
} as const;

const stageLabels = { impression: '曝光', click: '点击', conversion: '转化', order: '成交' } as const;

describe('buildTrendOption', () => {
  it('X 轴使用日期，两条折线分别绑定双 Y 轴', () => {
    const option = buildTrendOption(trend) as OptionShape;

    expect(option.xAxis?.data).toEqual(['2026-09-19', '2026-09-20']);
    expect(option.series?.map((series) => series.name)).toEqual(['消耗', '点击']);
    expect(option.series?.map((series) => series.type)).toEqual(['line', 'line']);
    expect(option.series?.[0].yAxisIndex).toBe(0);
    expect(option.series?.[1].yAxisIndex).toBe(1);
    expect(option.series?.[0].data).toEqual([1000, 2000]);
    expect(option.series?.[1].data).toEqual([100, 300]);
  });

  it('空数据时仍返回可渲染的空序列', () => {
    const option = buildTrendOption([]) as OptionShape;

    expect(option.xAxis?.data).toEqual([]);
    expect(option.series?.[0].data).toEqual([]);
  });

  it('Y 轴刻度使用千分位格式化', () => {
    const option = buildTrendOption(trend) as OptionShape;
    const yAxis = option.yAxis as AxisOption[];

    expect(yAxis[0].axisLabel?.formatter?.(1234567)).toBe('1,234,567');
  });
});

describe('buildChannelBarOption', () => {
  it('渠道按中文名展示，消耗与收入为分组柱状', () => {
    const option = buildChannelBarOption(channels, channelLabels) as OptionShape;

    expect(option.xAxis?.data).toEqual(['抖音', '百度']);
    expect(option.series?.map((series) => series.name)).toEqual(['消耗', '收入']);
    expect(option.series?.every((series) => series.type === 'bar')).toBe(true);
    expect(option.series?.[0].data).toEqual([1000, 500]);
    expect(option.series?.[1].data).toEqual([3000, 800]);
  });

  it('无渠道数据时返回空坐标轴', () => {
    const option = buildChannelBarOption([], channelLabels) as OptionShape;
    expect(option.xAxis?.data).toEqual([]);
  });
});

describe('buildFunnelOption', () => {
  it('漏斗数据按阶段顺序排列，首阶段不展示转化率', () => {
    const option = buildFunnelOption(funnel, stageLabels) as OptionShape;
    const data = option.series?.[0].data as Array<{
      name: string;
      value: number;
      rate: number | null;
    }>;

    expect(option.series?.[0].type).toBe('funnel');
    expect(data.map((item) => item.name)).toEqual(['曝光', '点击', '转化', '成交']);
    expect(data.map((item) => item.value)).toEqual([10000, 300, 30, 12]);
    expect(data[0].rate).toBeNull();
    expect(data[1].rate).toBe(0.03);
  });

  it('标签格式化为 「阶段 数值（转化率）」', () => {
    const option = buildFunnelOption(funnel, stageLabels) as OptionShape;
    const formatter = option.series?.[0].label?.formatter;

    expect(formatter?.({ name: '曝光', value: 10000, data: { rate: null } })).toBe('曝光 10,000');
    expect(formatter?.({ name: '点击', value: 300, data: { rate: 0.03 } })).toBe('点击 300（3.00%）');
  });
});
