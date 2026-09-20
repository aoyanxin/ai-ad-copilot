import type { AdChannel } from '@ai-ad-copilot/shared';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createMockDashboardService } from '../services/mock/dashboardService';
import type { DashboardService } from '../services/dashboard';
import { useAdPlans } from './useAdPlans';
import { useDashboardOverview } from './useDashboardOverview';
import { useDashboardRecords } from './useDashboardRecords';

const service = createMockDashboardService({ delayMs: 0 });

describe('useDashboardOverview', () => {
  it('按筛选条件请求概览数据', async () => {
    const getOverview = vi.fn(service.getOverview);
    const { result } = renderHook(() =>
      useDashboardOverview(
        { from: '2026-09-07', to: '2026-09-20', channels: ['douyin'] },
        { ...service, getOverview },
      ),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getOverview).toHaveBeenCalledWith(
      { from: '2026-09-07', to: '2026-09-20', channels: ['douyin'] },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data?.trend).toHaveLength(14);
    expect(result.current.data?.channels.map((item) => item.channel)).toEqual(['douyin']);
  });

  it('渠道顺序变化不会触发重复请求（query key 对顺序不敏感）', async () => {
    const stub: DashboardService = {
      ...service,
      getOverview: vi.fn(service.getOverview),
    };

    const { rerender } = renderHook(
      ({ channels }: { channels: AdChannel[] }) =>
        useDashboardOverview({ from: '2026-09-07', to: '2026-09-20', channels }, stub),
      { initialProps: { channels: ['baidu', 'douyin'] } },
    );

    await waitFor(() => expect(stub.getOverview).toHaveBeenCalledTimes(1));
    rerender({ channels: ['douyin', 'baidu'] });

    await waitFor(() => expect(stub.getOverview).toHaveBeenCalledTimes(1));
  });
});

describe('useDashboardRecords', () => {
  it('携带分页与排序参数请求明细', async () => {
    const getRecords = vi.fn(service.getRecords);
    const { result } = renderHook(() =>
      useDashboardRecords(
        {
          from: '2026-09-07',
          to: '2026-09-20',
          page: 1,
          pageSize: 5,
          sortField: 'spend',
          sortOrder: 'desc',
        },
        { ...service, getRecords },
      ),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.list).toHaveLength(5);
    expect(result.current.data?.total).toBe(30);
  });
});

describe('useAdPlans', () => {
  it('返回计划下拉选项并在筛选后收窄', async () => {
    const { result } = renderHook(() => useAdPlans({ channels: ['baidu'] }, service));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(6);
    expect(result.current.data?.every((plan) => plan.channel === 'baidu')).toBe(true);
  });
});
