import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from './appStore';

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarCollapsed: false });
  });

  it('默认展开侧边栏', () => {
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('toggleSidebar 在展开与收起之间切换', () => {
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);

    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it('setSidebarCollapsed 幂等设置目标状态', () => {
    useAppStore.getState().setSidebarCollapsed(true);
    useAppStore.getState().setSidebarCollapsed(true);

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
  });
});
