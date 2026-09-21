import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@ai-ad-copilot/shared';

import { TestApp } from '../test/TestApp';
import { NAV_ITEMS } from './nav-items';
import { routes, toChildPath } from './routes';

function renderAppAt(path: string) {
  render(<TestApp initialPath={path} />);
}

describe('路由表', () => {
  it('每个侧边栏菜单项都有对应路由', () => {
    const childPaths = routes
      .flatMap((route) => route.children ?? [])
      .map((child) => child.path)
      .filter((path): path is string => Boolean(path));

    NAV_ITEMS.forEach((item) => {
      expect(childPaths).toContain(toChildPath(item.key));
    });
  });

  it('访问 /dashboard 渲染数据看板', async () => {
    renderAppAt(ROUTE_PATHS.dashboard);

    expect(
      await screen.findByRole('heading', { level: 3, name: '广告数据看板' }),
    ).toBeInTheDocument();
  });

  it('访问 /copilot 渲染 AI Copilot 页面', async () => {
    renderAppAt(ROUTE_PATHS.copilot);

    expect(
      await screen.findByRole('heading', { level: 3, name: 'AI 文案助手' }),
    ).toBeInTheDocument();
  });

  it('访问 /lowcode 与 /rag 分别渲染对应页面', async () => {
    renderAppAt(ROUTE_PATHS.lowcode);
    expect(await screen.findByRole('heading', { level: 3, name: 'LowCode' })).toBeInTheDocument();

    renderAppAt(ROUTE_PATHS.rag);
    expect(await screen.findByRole('heading', { level: 3, name: 'RAG' })).toBeInTheDocument();
  });

  it('未知路径渲染 404 页面', async () => {
    renderAppAt('/not-exist');

    expect(await screen.findByText('页面不存在')).toBeInTheDocument();
  });

  it('根路径重定向到 dashboard', async () => {
    renderAppAt('/');

    expect(
      await screen.findByRole('heading', { level: 3, name: '广告数据看板' }),
    ).toBeInTheDocument();
  });
});
