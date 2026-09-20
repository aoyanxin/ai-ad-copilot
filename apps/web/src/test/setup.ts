import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * jsdom 没有 canvas，echarts 真实实例无法初始化（zrender 会访问 null context）。
 * 这里给出全局最小替身；需要断言 echarts 调用的用例可在自己文件内 vi.mock 覆盖。
 */
vi.mock('echarts/core', () => ({
  init: () => ({
    setOption: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
  }),
  use: () => undefined,
}));
vi.mock('echarts/charts', () => ({ LineChart: {}, BarChart: {}, FunnelChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

afterEach(() => {
  cleanup();
});

// jsdom 未实现 antd 响应式组件依赖的浏览器 API，这里补齐最小可用实现
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

if (typeof globalThis.ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom 未实现滚动相关 API，antd Select / Table 的虚拟滚动会依赖它们
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = vi.fn();
}

// rc-util 测量滚动条时会传伪元素参数，jsdom 未实现该重载，这里做最小兼容
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element) =>
  nativeGetComputedStyle(element)) as typeof window.getComputedStyle;
