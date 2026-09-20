import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockDashboardService } from '../../services/mock/dashboardService';
import { useDashboardFilterStore } from '../../stores/dashboardFilterStore';
import { DashboardPage } from './index';

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

const service = createMockDashboardService({ delayMs: 0 });

describe('DashboardPage', () => {
  beforeEach(() => {
    useDashboardFilterStore.getState().resetFilters();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 看板一次性渲染 Table + DatePicker + 3 个图表，jsdom 下需要更宽的执行预算
  it(
    '渲染筛选栏、六个指标卡、三个图表与明细表',
    async () => {
    render(<DashboardPage service={service} />);

    expect(
      await screen.findByRole('heading', { level: 3, name: '广告数据看板' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-filter-bar')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('metric-card-消耗')).toBeInTheDocument(),
    );
    ['消耗', '点击', '转化', 'CTR', 'CVR', 'ROI'].forEach((label) => {
      expect(screen.getByTestId(`metric-card-${label}`)).toBeInTheDocument();
    });

    expect(await screen.findByRole('img', { name: '消耗与点击趋势图' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '渠道消耗与收入对比图' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '转化漏斗图' })).toBeInTheDocument();

    expect(await screen.findByText('广告计划明细')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length).toBe(10),
    );
    },
    20_000,
  );

  it('指标卡展示真实数值而不是占位符', async () => {
    render(<DashboardPage service={service} />);

    await waitFor(() => {
      const card = screen.getByTestId('metric-card-消耗');
      expect(card.textContent).toMatch(/¥/);
    });
    expect(screen.getByTestId('metric-card-CTR').textContent).toMatch(/%/);
  });

  it('筛选条件变化会带着新参数重新请求概览', async () => {
    const getOverview = vi.fn(service.getOverview);
    render(<DashboardPage service={{ ...service, getOverview }} />);
    await waitFor(() => expect(getOverview).toHaveBeenCalledTimes(1));

    act(() => {
      useDashboardFilterStore.getState().setFilter({
        ...useDashboardFilterStore.getState().filter,
        channels: ['douyin'],
      });
    });

    await waitFor(() =>
      expect(getOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ channels: ['douyin'] }),
        expect.anything(),
      ),
    );
  });

  it('概览接口失败时展示错误与重试，并保留明细表可用', async () => {
    const getOverview = vi.fn().mockRejectedValue(new Error('概览接口异常'));
    render(<DashboardPage service={{ ...service, getOverview }} />);

    expect(await screen.findByText('看板数据加载失败')).toBeInTheDocument();
    expect(screen.getByText('概览接口异常')).toBeInTheDocument();
    expect(await screen.findByText('广告计划明细')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /重\s*试/ }).length).toBeGreaterThan(0);
  });
});
