/**
 * echarts 按需注册的唯一出口。
 *
 * 注意：这是全项目唯一 import echarts 运行时模块的文件，且只允许 BaseChart.tsx 引用它，
 * 其他图表组件一律通过 BaseChart 渲染，保证「按需引入 + 分包」策略不会被绕过，
 * 也保证 echarts 不会被打进入口 chunk。
 */

import { BarChart, FunnelChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

export { echarts };
export type { ECharts, EChartsCoreOption } from 'echarts/core';
