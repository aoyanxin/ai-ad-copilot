/**
 * 图表 option 的结构类型。
 *
 * 刻意不 import echarts 的类型：echarts 相关模块只允许 echartsSetup.ts 引入，
 * 由 BaseChart.tsx 在边界处一次性转换成 echarts 的 option 类型。
 * 这样 echarts 的类型依赖被收口在一个文件里，option 构造器保持纯函数、易测。
 */
export type ChartOption = Record<string, unknown>;
