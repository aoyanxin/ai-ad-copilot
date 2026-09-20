import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateKeyToEpochDay,
  diffInDays,
  eachDateKey,
  epochDayToDateKey,
  getDefaultDateRange,
  getTodayKey,
  isDateKey,
  normalizeDateRange,
  shiftDateRange,
} from './date';

describe('日期字符串校验', () => {
  it('只接受合法的 YYYY-MM-DD', () => {
    expect(isDateKey('2026-09-20')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-9-1')).toBe(false);
    expect(isDateKey('20260901')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe('纪元日换算', () => {
  it('字符串与纪元日可双向转换', () => {
    const key = '2026-09-20';
    expect(epochDayToDateKey(dateKeyToEpochDay(key))).toBe(key);
  });

  it('跨月跨年运算不漂移', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffInDays('2026-09-01', '2026-09-20')).toBe(19);
    expect(diffInDays('2026-09-20', '2026-09-01')).toBe(-19);
  });

  it('非法日期抛错，便于尽早暴露调用错误', () => {
    expect(() => dateKeyToEpochDay('2026-02-30')).toThrowError();
  });
});

describe('日期序列', () => {
  it('生成含首尾的连续日期，起止颠倒时为空', () => {
    expect(eachDateKey('2026-09-18', '2026-09-20')).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(eachDateKey('2026-09-20', '2026-09-20')).toEqual(['2026-09-20']);
    expect(eachDateKey('2026-09-20', '2026-09-18')).toEqual([]);
    expect(eachDateKey('bad', '2026-09-20')).toEqual([]);
  });
});

describe('默认区间与平移', () => {
  it('默认区间包含今天并向前推 days - 1 天', () => {
    expect(getDefaultDateRange('2026-09-20', 14)).toEqual({
      from: '2026-09-07',
      to: '2026-09-20',
    });
    expect(getDefaultDateRange('2026-09-20', 1)).toEqual({
      from: '2026-09-20',
      to: '2026-09-20',
    });
  });

  it('整体平移保持区间长度', () => {
    expect(shiftDateRange({ from: '2026-09-07', to: '2026-09-20' }, -14)).toEqual({
      from: '2026-08-24',
      to: '2026-09-06',
    });
  });

  it('getTodayKey 使用本地日期', () => {
    expect(getTodayKey(new Date(2026, 8, 20, 23, 30))).toBe('2026-09-20');
  });
});

describe('区间纠偏', () => {
  it('非法区间回退到默认区间', () => {
    expect(normalizeDateRange('bad', '2026-09-20', 90, '2026-09-20', 14)).toEqual({
      from: '2026-09-07',
      to: '2026-09-20',
    });
  });

  it('起止颠倒时交换', () => {
    expect(normalizeDateRange('2026-09-20', '2026-09-18', 90)).toEqual({
      from: '2026-09-18',
      to: '2026-09-20',
    });
  });

  it('超过最大跨度时保留终点并向前收窄', () => {
    expect(normalizeDateRange('2026-01-01', '2026-09-20', 30)).toEqual({
      from: '2026-08-22',
      to: '2026-09-20',
    });
  });

  it('跨度等于上限时原样返回', () => {
    expect(normalizeDateRange('2026-08-22', '2026-09-20', 30)).toEqual({
      from: '2026-08-22',
      to: '2026-09-20',
    });
  });
});
