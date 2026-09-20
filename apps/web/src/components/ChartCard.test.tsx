import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChartCard } from './ChartCard';

describe('ChartCard', () => {
  it('渲染标题、副标题、操作区与内容', () => {
    render(
      <ChartCard title="消耗趋势" subtitle="按天聚合" extra={<button type="button">导出</button>}>
        <div>图表内容</div>
      </ChartCard>,
    );

    expect(screen.getByText('消耗趋势')).toBeInTheDocument();
    expect(screen.getByText('按天聚合')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出' })).toBeInTheDocument();
    expect(screen.getByText('图表内容')).toBeInTheDocument();
  });

  it('未传副标题时不渲染副标题', () => {
    render(
      <ChartCard title="渠道对比">
        <div>图表内容</div>
      </ChartCard>,
    );

    expect(screen.getByText('渠道对比')).toBeInTheDocument();
    expect(screen.queryByText('按天聚合')).not.toBeInTheDocument();
  });
});
