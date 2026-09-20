import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetricCard } from './MetricCard';

const GOOD_COLOR_RGB = 'rgb(56, 158, 13)';
const BAD_COLOR_RGB = 'rgb(207, 19, 34)';

describe('MetricCard', () => {
  it('渲染指标名、格式化后的数值与环比', () => {
    render(<MetricCard label="CTR" value="3.43%" delta={0.1234} />);

    expect(screen.getByText('CTR')).toBeInTheDocument();
    expect(screen.getByText('3.43%')).toBeInTheDocument();
    expect(screen.getByText(/\+12\.34% 环比/)).toBeInTheDocument();
  });

  it('上升为正向好时环比为绿色', () => {
    render(<MetricCard label="点击" value="1,000" delta={0.1} />);

    expect(screen.getByText(/\+10\.00% 环比/).style.color).toBe(GOOD_COLOR_RGB);
  });

  it('消耗类指标上升视为变差，环比为红色', () => {
    render(<MetricCard label="消耗" value="¥1,000.00" delta={0.1} positiveIsGood={false} />);

    expect(screen.getByText(/\+10\.00% 环比/).style.color).toBe(BAD_COLOR_RGB);
  });

  it('无对照期时环比展示占位符且为中性色', () => {
    render(<MetricCard label="ROI" value="2.35" delta={null} />);

    const delta = screen.getByText(/- 环比/);
    expect(delta.style.color).toBe('rgba(0, 0, 0, 0.45)');
  });

  it('loading 时展示骨架屏而不是数值', () => {
    const { container } = render(<MetricCard label="消耗" value="¥1,000.00" loading />);

    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByText('¥1,000.00')).not.toBeInTheDocument();
  });
});
