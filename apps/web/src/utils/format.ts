/**
 * 数值/日期格式化工具：全部为纯函数，指标卡、图表 tooltip 与表格共用同一套渲染口径。
 * 约定：接口返回比值（0.0342 表示 3.42%），格式化只在前端做。
 */

const PLACEHOLDER = '-';
const WAN = 10_000;
const YI = 100_000_000;

export interface NumberFormatOptions {
  /** 小数位，默认 2 */
  digits?: number;
  /** 是否使用万/亿紧凑单位，默认 false */
  compact?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function groupIntegerPart(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function toFixedString(value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits);
  const [integerPart, decimalPart] = fixed.split('.');
  const grouped = groupIntegerPart(integerPart);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return decimalPart ? `${sign}${grouped}.${decimalPart}` : `${sign}${grouped}`;
}

/** 紧凑单位下去掉无意义的尾随 0：120.00万 -> 120万，4.20万 -> 4.2万 */
function trimTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** 通用数值格式化：千分位 + 固定小数位，可选万/亿紧凑单位 */
export function formatNumber(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (!isFiniteNumber(value)) {
    return PLACEHOLDER;
  }

  const { digits = 2, compact = false } = options;

  if (!compact) {
    return toFixedString(value, digits);
  }

  const absolute = Math.abs(value);
  if (absolute >= YI) {
    return `${trimTrailingZeros(toFixedString(value / YI, digits))}亿`;
  }
  if (absolute >= WAN) {
    return `${trimTrailingZeros(toFixedString(value / WAN, digits))}万`;
  }
  return trimTrailingZeros(toFixedString(value, digits));
}

/** 金额格式化，默认保留两位小数 */
export function formatCurrency(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (!isFiniteNumber(value)) {
    return PLACEHOLDER;
  }
  const formatted = formatNumber(value, options);
  return formatted.startsWith('-') ? `-¥${formatted.slice(1)}` : `¥${formatted}`;
}

/** 整数格式化（曝光、点击等计数值） */
export function formatInteger(value: number | null | undefined): string {
  return formatNumber(value, { digits: 0 });
}

function toPercentString(ratio: number, digits: number): string {
  const fixed = (ratio * 100).toFixed(digits);
  const normalized = Number(fixed) === 0 ? (0).toFixed(digits) : fixed;
  const [integerPart, decimalPart] = normalized.split('.');
  const grouped = groupIntegerPart(integerPart);
  const sign = normalized.startsWith('-') ? '-' : '';
  return `${sign}${grouped.replace('-', '')}${decimalPart ? `.${decimalPart}` : ''}`;
}

/** 比值 -> 百分比，0.03425 -> '3.43%' */
export function formatPercent(ratio: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(ratio)) {
    return PLACEHOLDER;
  }
  return `${toPercentString(ratio, digits)}%`;
}

/** 比值 -> 裸数值，2.3456 -> '2.35'（用于 ROI） */
export function formatRatio(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) {
    return PLACEHOLDER;
  }
  return toFixedString(value, digits);
}

/** 环比变化率：上一周期为 0 或缺省时无法计算，返回 null */
export function calcChangeRate(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous) || previous === 0) {
    return null;
  }
  return (current - previous) / Math.abs(previous);
}

/** 环比展示：0.1234 -> '+12.34%'，0 -> '0.00%'，null -> '-' */
export function formatDelta(rate: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(rate)) {
    return PLACEHOLDER;
  }

  const percent = toPercentString(rate, digits);
  if (Number((rate * 100).toFixed(digits)) === 0) {
    return `${percent}%`;
  }
  return `${rate > 0 ? '+' : ''}${percent}%`;
}

/** 区间展示：'2026-09-07 ~ 2026-09-20' */
export function formatDateRangeLabel(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from || !to) {
    return PLACEHOLDER;
  }
  return `${from} ~ ${to}`;
}
