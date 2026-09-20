import type { AdPlanOption } from '@ai-ad-copilot/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardFilter } from '../utils/filters';
import { DashboardFilterBar } from './DashboardFilterBar';

const filter: DashboardFilter = {
  from: '2026-09-07',
  to: '2026-09-20',
  channels: [],
  plan: null,
};

const planOptions: AdPlanOption[] = [
  { planId: 'p-101', planName: '抖音-秋季上新-信息流', channel: 'douyin', status: 'active' },
  { planId: 'p-401', planName: '百度-搜索品牌词', channel: 'baidu', status: 'paused' },
];

function renderBar(overrides: Partial<Parameters<typeof DashboardFilterBar>[0]> = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onRefresh = vi.fn();

  render(
    <DashboardFilterBar
      value={filter}
      onChange={onChange}
      onReset={onReset}
      onRefresh={onRefresh}
      planOptions={planOptions}
      updatedAt="2026-09-20T23:59:59+08:00"
      {...overrides}
    />,
  );

  return { onChange, onReset, onRefresh };
}

describe('DashboardFilterBar', () => {
  it('回显当前日期区间与数据截止时间', () => {
    renderBar();

    expect(screen.getByDisplayValue('2026-09-07')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-09-20')).toBeInTheDocument();
    expect(screen.getByText('数据截止 2026-09-20')).toBeInTheDocument();
  });

  it('渲染日期、渠道、广告计划三个筛选控件', () => {
    renderBar();

    expect(within(screen.getByTestId('date-range-filter')).getAllByRole('textbox')).toHaveLength(2);
    expect(within(screen.getByTestId('channel-filter')).getByRole('combobox')).toBeInTheDocument();
    expect(within(screen.getByTestId('plan-filter')).getByRole('combobox')).toBeInTheDocument();
  });

  it('选择渠道后回调新的渠道数组', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();

    await user.click(within(screen.getByTestId('channel-filter')).getByRole('combobox'));
    await user.click(await screen.findByTitle('抖音'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channels: ['douyin'] }));
  });

  it('选择广告计划后回调完整计划对象', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar();

    await user.click(within(screen.getByTestId('plan-filter')).getByRole('combobox'));
    await user.click(await screen.findByTitle('百度-搜索品牌词（百度）'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ planId: 'p-401' }) }),
    );
  });

  it('已选计划不在最新选项时仍能正确回显标签', () => {
    renderBar({ value: { ...filter, plan: planOptions[1] }, planOptions: [] });

    expect(screen.getByTitle('百度-搜索品牌词（百度）')).toBeInTheDocument();
  });

  it('刷新与重置分别触发对应回调', async () => {
    const user = userEvent.setup();
    const { onRefresh, onReset } = renderBar();

    await user.click(screen.getByRole('button', { name: /刷新/ }));
    await user.click(screen.getByRole('button', { name: /重置/ }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('刷新中按钮展示 loading', () => {
    renderBar({ refreshing: true });

    expect(screen.getByRole('button', { name: /刷新/ })).toHaveClass('ant-btn-loading');
  });
});
