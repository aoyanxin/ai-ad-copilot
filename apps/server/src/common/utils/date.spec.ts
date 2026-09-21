import {
  addDays,
  dateKeyToUtcDate,
  diffInDays,
  eachDateKey,
  getShanghaiTodayKey,
  isDateKey,
  shiftDateRange,
  utcDateToDateKey,
} from './date';

describe('isDateKey', () => {
  it('接受合法的 YYYY-MM-DD', () => {
    expect(isDateKey('2026-09-07')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true);
  });

  it('拒绝格式不正确或日历上不存在的日期', () => {
    expect(isDateKey('2026-9-7')).toBe(false);
    expect(isDateKey('2026/09/07')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2025-02-29')).toBe(false);
    expect(isDateKey('')).toBe(false);
  });

  it('拒绝非字符串输入', () => {
    expect(isDateKey(20260907)).toBe(false);
    expect(isDateKey(null)).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe('eachDateKey', () => {
  it('包含首尾两端', () => {
    expect(eachDateKey('2026-09-07', '2026-09-09')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('跨月连续无空洞', () => {
    expect(eachDateKey('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('跨年连续无空洞', () => {
    expect(eachDateKey('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('覆盖闰年 2 月', () => {
    expect(eachDateKey('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('非法区间返回空数组', () => {
    expect(eachDateKey('2026-09-20', '2026-09-01')).toEqual([]);
    expect(eachDateKey('2026-02-30', '2026-03-01')).toEqual([]);
    expect(eachDateKey('', '2026-03-01')).toEqual([]);
  });
});

describe('addDays / diffInDays', () => {
  it('跨月与跨年加减天数安全', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-09-07', 0)).toBe('2026-09-07');
  });

  it('天数差保留方向', () => {
    expect(diffInDays('2026-09-07', '2026-09-20')).toBe(13);
    expect(diffInDays('2026-09-20', '2026-09-07')).toBe(-13);
    expect(diffInDays('2026-09-07', '2026-09-07')).toBe(0);
  });

  it('日期序列长度与天数差一致（闭区间口径）', () => {
    const from = '2026-01-15';
    const to = '2026-04-20';
    expect(eachDateKey(from, to)).toHaveLength(diffInDays(from, to) + 1);
  });
});

describe('shiftDateRange', () => {
  it('整体平移区间，用于环比对照期', () => {
    expect(shiftDateRange({ from: '2026-09-07', to: '2026-09-20' }, -14)).toEqual({
      from: '2026-08-24',
      to: '2026-09-06',
    });
  });
});

describe('getShanghaiTodayKey', () => {
  it('按 Asia/Shanghai 日切，而不是机器本地时区', () => {
    // 北京时间 2026-09-21 00:30
    expect(getShanghaiTodayKey(new Date('2026-09-20T16:30:00.000Z'))).toBe('2026-09-21');
    // 北京时间 2026-09-20 23:59
    expect(getShanghaiTodayKey(new Date('2026-09-20T15:59:00.000Z'))).toBe('2026-09-20');
    // 北京时间 2026-09-21 00:00 整
    expect(getShanghaiTodayKey(new Date('2026-09-20T16:00:00.000Z'))).toBe('2026-09-21');
  });

  it('跨年边界正确', () => {
    expect(getShanghaiTodayKey(new Date('2025-12-31T16:00:00.000Z'))).toBe('2026-01-01');
  });
});

describe('dateKeyToUtcDate / utcDateToDateKey', () => {
  it('转换结果是 UTC 零点，不受本地时区影响', () => {
    // 用 new Date('2026-09-07') 会在 UTC+8 下变成 09-07T08:00 的本地零点问题，
    // 这里断言必须是 09-07T00:00:00.000Z
    expect(dateKeyToUtcDate('2026-09-07').toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('往返转换不漂移', () => {
    const keys = ['2026-01-01', '2026-02-28', '2024-02-29', '2026-09-07', '2026-12-31'];
    keys.forEach((key) => {
      expect(utcDateToDateKey(dateKeyToUtcDate(key))).toBe(key);
    });
  });

  it('连续 90 天往返后仍是同一天', () => {
    const days = eachDateKey('2026-06-01', '2026-08-29');
    expect(days).toHaveLength(90);
    const drifted = days.filter((key) => utcDateToDateKey(dateKeyToUtcDate(key)) !== key);
    expect(drifted).toEqual([]);
  });

  it('非法输入抛错', () => {
    expect(() => dateKeyToUtcDate('2026-02-30')).toThrow('非法的日期字符串');
    expect(() => dateKeyToUtcDate('2026-9-7')).toThrow('非法的日期字符串');
    expect(() => utcDateToDateKey(new Date('invalid'))).toThrow('非法的 Date 对象');
  });
});
