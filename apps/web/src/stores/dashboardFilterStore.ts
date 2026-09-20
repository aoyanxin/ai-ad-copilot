import { create } from 'zustand';

import {
  createDefaultFilter,
  normalizeFilter,
  reconcilePlanSelection,
  sortChannels,
  type DashboardFilter,
} from '../pages/Dashboard/utils/filters';

export interface DashboardFilterState {
  filter: DashboardFilter;
  /**
   * 整体替换筛选条件：统一做日期区间纠偏、渠道顺序规范化，
   * 并在渠道变化后清空落到未选中渠道上的计划。
   */
  setFilter: (filter: DashboardFilter) => void;
  resetFilters: () => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  filter: createDefaultFilter(),

  setFilter: (filter) =>
    set(() => {
      const channels = sortChannels(filter.channels);
      return {
        filter: normalizeFilter({
          ...filter,
          channels,
          plan: reconcilePlanSelection(channels, filter.plan),
        }),
      };
    }),

  resetFilters: () => set({ filter: createDefaultFilter() }),
}));
