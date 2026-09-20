import type { ChannelMetric, FunnelStage, TrendPoint } from '@ai-ad-copilot/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelBarChart } from './ChannelBarChart';
import { ConversionFunnelChart } from './ConversionFunnelChart';
import { TrendChart } from './TrendChart';

const echartsMock = vi.hoisted(() => {
  const instance = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  };
  return { instance, init: vi.fn(() => instance), use: vi.fn() };
});

vi.mock('echarts/core', () => ({ init: echartsMock.init, use: echartsMock.use }));
vi.mock('echarts/charts', () => ({ LineChart: {}, BarChart: {}, FunnelChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const trend: TrendPoint[] = [{ date: '2026-09-19', spend: 1000, clicks: 100, conversions: 10 }];
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

describe('图表组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TrendChart 渲染图表容器并写入折线 option', () => {
    render(<TrendChart data={trend} />);

    expect(screen.getByRole('img', { name: '消耗与点击趋势图' })).toBeInTheDocument();
    const option = echartsMock.instance.setOption.mock.calls[0][0] as {
      series: Array<{ type: string }>;
    };
    expect(option.series.map((series) => series.type)).toEqual(['line', 'line']);
  });

  it('TrendChart 无数据时展示空态', () => {
    render(<TrendChart data={[]} />);

    expect(screen.getByText('所选区间没有投放数据')).toBeInTheDocument();
    expect(echartsMock.instance.setOption).not.toHaveBeenCalled();
  });

  it('ChannelBarChart 使用注入的渠道标签渲染柱状图', () => {
    render(<ChannelBarChart data={channels} channelLabels={channelLabels} />);

    const option = echartsMock.instance.setOption.mock.calls[0][0] as {
      xAxis: { data: string[] };
    };
    expect(screen.getByRole('img', { name: '渠道消耗与收入对比图' })).toBeInTheDocument();
    expect(option.xAxis.data).toEqual(['抖音']);
  });

  it('ConversionFunnelChart 全 0 数据视为空态，有数据时渲染漏斗', () => {
    const { unmount } = render(
      <ConversionFunnelChart
        data={funnel.map((stage) => ({ ...stage, value: 0 }))}
        stageLabels={stageLabels}
      />,
    );
    expect(screen.getByText('所选区间没有转化数据')).toBeInTheDocument();
    unmount();

    render(<ConversionFunnelChart data={funnel} stageLabels={stageLabels} />);
    const option = echartsMock.instance.setOption.mock.calls[0][0] as {
      series: Array<{ type: string }>;
    };
    expect(option.series[0].type).toBe('funnel');
  });

  it('loading 透传到 BaseChart', () => {
    render(<TrendChart data={trend} loading />);

    expect(echartsMock.instance.showLoading).toHaveBeenCalled();
  });
});
