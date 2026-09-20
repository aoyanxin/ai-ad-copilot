import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ROUTE_PATHS, type RoutePath } from '@ai-ad-copilot/shared';

import { NAV_ITEMS } from '../router/nav-items';
import { useAppStore } from '../stores/appStore';
import { TestApp } from '../test/TestApp';

function renderLayout(path: RoutePath = ROUTE_PATHS.dashboard) {
  render(<TestApp initialPath={path} />);
}

describe('BasicLayout', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarCollapsed: false });
  });

  it('侧边栏渲染 Dashboard / AI Copilot / LowCode / RAG 四个入口', async () => {
    renderLayout();

    const nav = await screen.findByRole('menu');
    const labels = await screen.findAllByRole('menuitem');

    expect(nav).toBeInTheDocument();
    expect(labels.map((item) => item.textContent?.trim())).toEqual(
      NAV_ITEMS.map((item) => item.label),
    );
  });

  it('顶部栏展示当前页面标题与用户占位', async () => {
    renderLayout(ROUTE_PATHS.rag);

    expect(await screen.findByRole('heading', { level: 4, name: 'RAG' })).toBeInTheDocument();
    expect(screen.getByText('Demo 用户')).toBeInTheDocument();
  });

  it('点击菜单项跳转到对应路由', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(await screen.findByRole('menuitem', { name: /LowCode/ }));

    expect(await screen.findByRole('heading', { level: 4, name: 'LowCode' })).toBeInTheDocument();
  });

  it('点击折叠按钮切换侧边栏状态', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(await screen.findByRole('button', { name: '收起侧边栏' }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
    expect(await screen.findByRole('button', { name: '展开侧边栏' })).toBeInTheDocument();
  });
});
