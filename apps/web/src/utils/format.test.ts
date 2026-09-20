import { describe, expect, it } from 'vitest';

import {
  calcChangeRate,
  formatCurrency,
  formatDateRangeLabel,
  formatDelta,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRatio,
} from './format';

describe('formatNumber', () => {
  it('千分位分组并保留两位小数', () => {
    expect(formatNumber(1234567.891)).toBe('1,234,567.89');
    expect(formatNumber(0)).toBe('0.00');
    expect(formatNumber(999)).toBe('999.00');
  });

  it('支持自定义小数位与负数', () => {
    expect(formatNumber(-1234.5, { digits: 1 })).toBe('-1,234.5');
    expect(formatNumber(-0.004, { digits: 2 })).toBe('0.00');
  });

  it('紧凑模式使用万 / 亿，并统一去掉尾随 0', () => {
    expect(formatNumber(1234567.891, { compact: true })).toBe('123.46万');
    expect(formatNumber(987654321, { compact: true })).toBe('9.88亿');
    expect(formatNumber(9876.5, { compact: true })).toBe('9,876.5');
    expect(formatNumber(-25000, { compact: true })).toBe('-2.5万');
  });

  it('紧凑模式去掉无意义的尾随 0，但保留千分位精度', () => {
    expect(formatNumber(42000, { compact: true, digits: 1 })).toBe('4.2万');
    expect(formatNumber(1200000, { compact: true })).toBe('120万');
    expect(formatNumber(3200, { compact: true, digits: 1 })).toBe('3,200');
  });

  it('非法值返回占位符而不是 NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('-');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('-');
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('金额带 ¥ 与两位小数', () => {
    expect(formatCurrency(1234567.891)).toBe('¥1,234,567.89');
    expect(formatCurrency(1234567.891, { compact: true })).toBe('¥123.46万');
    expect(formatCurrency(1200000, { compact: true })).toBe('¥120万');
  });

  it('负数金额符号在货币符号之前，避免出现 ¥-1,234.50', () => {
    expect(formatCurrency(-1234.5)).toBe('-¥1,234.50');
  });

  it('非法值返回占位符', () => {
    expect(formatCurrency(Number.NaN)).toBe('-');
  });
});

describe('formatInteger', () => {
  it('计数值不带小数', () => {
    expect(formatInteger(1234567.891)).toBe('1,234,568');
    expect(formatInteger(0)).toBe('0');
    expect(formatInteger(null)).toBe('-');
  });
});

describe('formatPercent / formatRatio', () => {
  it('比值按百分比渲染并四舍五入', () => {
    expect(formatPercent(0.03425)).toBe('3.43%');
    expect(formatPercent(0.5)).toBe('50.00%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(1.2345)).toBe('123.45%');
  });

  it('非法比值返回占位符', () => {
    expect(formatPercent(Number.NaN)).toBe('-');
    expect(formatPercent(undefined)).toBe('-');
    expect(formatRatio(Number.NaN)).toBe('-');
  });

  it('ROI 以裸数值渲染', () => {
    expect(formatRatio(2.3456)).toBe('2.35');
    expect(formatRatio(0)).toBe('0.00');
  });
});

describe('calcChangeRate / formatDelta', () => {
  it('计算环比变化率', () => {
    expect(calcChangeRate(110, 100)).toBeCloseTo(0.1, 10);
    expect(calcChangeRate(90, 100)).toBeCloseTo(-0.1, 10);
    expect(calcChangeRate(100, 0)).toBeNull();
    expect(calcChangeRate(Number.NaN, 100)).toBeNull();
  });

  it('环比带正负号，零值不带符号', () => {
    expect(formatDelta(0.1234)).toBe('+12.34%');
    expect(formatDelta(-0.05)).toBe('-5.00%');
    expect(formatDelta(0)).toBe('0.00%');
  });

  it('极小值不会渲染成 -0.00%', () => {
    expect(formatDelta(-0.000001)).toBe('0.00%');
    expect(formatDelta(Number.NaN)).toBe('-');
    expect(formatDelta(null)).toBe('-');
  });
});

describe('formatDateRangeLabel', () => {
  it('渲染区间文案', () => {
    expect(formatDateRangeLabel('2026-09-07', '2026-09-20')).toBe('2026-09-07 ~ 2026-09-20');
    expect(formatDateRangeLabel(undefined, '2026-09-20')).toBe('-');
  });
});
