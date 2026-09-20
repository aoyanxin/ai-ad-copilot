import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createMockDashboardService } from '../../../services/mock/dashboardService';
import { AdRecordTable } from './AdRecordTable';

const baseQuery = { from: '2026-09-07', to: '2026-09-20' } as const;
const service = createMockDashboardService({ delayMs: 0 });

function renderTable(props: Partial<Parameters<typeof AdRecordTable>[0]> = {}) {
  const getRecords = vi.fn(service.getRecords);
  render(<AdRecordTable baseQuery={{ ...baseQuery }} service={{ ...service, getRecords }} {...props} />);
  return { getRecords };
}

/** 首屏默认按消耗降序，直接问服务拿期望的首行，避免把断言写死在某个计划上 */
async function firstRowPlanName(): Promise<string> {
  const page = await service.getRecords({
    ...baseQuery,
    page: 1,
    pageSize: 10,
    sortField: 'spend',
    sortOrder: 'desc',
  });
  return page.list[0].planName;
}

function renderedRowCount(): number {
  return document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
}

describe('AdRecordTable', () => {
  it('渲染明细数据与总数，默认按消耗降序', async () => {
    const { getRecords } = renderTable();

    expect(await screen.findByText(await firstRowPlanName())).toBeInTheDocument();
    expect(renderedRowCount()).toBe(10);
    expect(screen.getAllByText(/共 30 条/).length).toBeGreaterThan(0);

    expect(getRecords).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10, sortField: 'spend', sortOrder: 'desc' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('翻页时携带新的页码重新查询', async () => {
    const user = userEvent.setup();
    const { getRecords } = renderTable();
    await screen.findByText(await firstRowPlanName());

    const secondPage = document.querySelector('.ant-pagination-item-2');
    expect(secondPage).not.toBeNull();
    await user.click(secondPage as HTMLElement);

    await waitFor(() =>
      expect(getRecords).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 10 }),
        expect.anything(),
      ),
    );
  });

  it('计划名列筛选支持关键字搜索并回到第一页', async () => {
    const user = userEvent.setup();
    const { getRecords } = renderTable();
    await screen.findByText(await firstRowPlanName());

    const filterTrigger = document.querySelector('.ant-table-filter-trigger');
    expect(filterTrigger).not.toBeNull();
    await user.click(filterTrigger as HTMLElement);

    const input = await screen.findByPlaceholderText('搜索计划名');
    fireEvent.change(input, { target: { value: '百度' } });
    await user.click(screen.getByRole('button', { name: /搜\s*索/ }));

    await waitFor(() =>
      expect(getRecords).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: '百度', page: 1 }),
        expect.anything(),
      ),
    );

    expect(await screen.findByText('百度-搜索品牌词')).toBeInTheDocument();
  });

  it('无符合条件的数据时展示空态', async () => {
    render(
      <AdRecordTable
        baseQuery={{ from: '2026-09-15', to: '2026-09-20', planId: 'p-101' }}
        service={service}
      />,
    );

    expect(await screen.findByText('没有符合条件的广告计划')).toBeInTheDocument();
  });

  it('请求失败时展示错误与重试入口', async () => {
    const user = userEvent.setup();
    const getRecords = vi
      .fn()
      .mockRejectedValueOnce(new Error('后端开小差了'))
      .mockImplementation(service.getRecords);

    render(
      <AdRecordTable baseQuery={{ ...baseQuery }} service={{ ...service, getRecords }} />,
    );

    expect(await screen.findByText('明细数据加载失败')).toBeInTheDocument();
    expect(screen.getByText('后端开小差了')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /重\s*试/ }));

    await waitFor(() => expect(getRecords).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(renderedRowCount()).toBe(10));
  });
});
