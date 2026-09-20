import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseChart } from './BaseChart';

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

let resizeCallback: (() => void) | null = null;

class ControllableResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = () => callback([], this as unknown as ResizeObserver);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('BaseChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始化 echarts 实例并写入 option', () => {
    const option = { series: [{ type: 'line' }] };
    render(<BaseChart option={option} ariaLabel="测试图表" />);

    const container = screen.getByRole('img', { name: '测试图表' });
    expect(container).toBeInTheDocument();
    expect(echartsMock.init).toHaveBeenCalledWith(
      container,
      undefined,
      expect.objectContaining({ renderer: 'canvas' }),
    );
    expect(echartsMock.instance.setOption).toHaveBeenCalledWith(option, { notMerge: true });
  });

  it('option 变化时增量更新同一个实例，不重复 init', () => {
    const { rerender } = render(<BaseChart option={{ title: 'a' }} />);
    rerender(<BaseChart option={{ title: 'b' }} />);

    expect(echartsMock.init).toHaveBeenCalledTimes(1);
    expect(echartsMock.instance.setOption).toHaveBeenLastCalledWith({ title: 'b' }, {
      notMerge: true,
    });
  });

  it('容器尺寸变化时触发 resize', () => {
    render(<BaseChart option={{}} />);

    expect(resizeCallback).not.toBeNull();
    resizeCallback?.();

    expect(echartsMock.instance.resize).toHaveBeenCalledTimes(1);
  });

  it('卸载时销毁实例，避免残留', () => {
    const { unmount } = render(<BaseChart option={{}} />);
    unmount();

    expect(echartsMock.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('loading 切换 echarts 的加载遮罩', () => {
    const { rerender } = render(<BaseChart option={{}} loading />);
    expect(echartsMock.instance.showLoading).toHaveBeenCalledWith('default', { text: '加载中' });

    rerender(<BaseChart option={{}} loading={false} />);
    expect(echartsMock.instance.hideLoading).toHaveBeenCalled();
  });

  it('数据为空时渲染空态，不初始化图表实例', () => {
    render(<BaseChart option={{}} empty emptyText="没有数据" />);

    expect(screen.getByText('没有数据')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(echartsMock.init).not.toHaveBeenCalled();
  });

  it('错误态展示错误信息与重试入口', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<BaseChart option={{}} error="接口挂了" onRetry={onRetry} />);

    expect(screen.getByText('接口挂了')).toBeInTheDocument();
    expect(echartsMock.init).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('支持 svg 渲染器（兜底场景）', () => {
    render(<BaseChart option={{}} renderer="svg" />);

    expect(echartsMock.init).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ renderer: 'svg' }),
    );
  });
});
