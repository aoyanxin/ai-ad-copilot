/** 图表统一配色与尺寸，避免散落在各图表组件里 */

export const CHART_COLORS = {
  spend: '#1677ff',
  clicks: '#52c41a',
  revenue: '#faad14',
  conversion: '#722ed1',
  funnel: ['#1677ff', '#36cfc9', '#52c41a', '#faad14'],
} as const;

export const CHART_DEFAULT_HEIGHT = 300;

export const CHART_GRID = {
  left: 8,
  right: 16,
  top: 40,
  bottom: 8,
  containLabel: true,
} as const;
