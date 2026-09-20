/**
 * 日期工具：统一使用 YYYY-MM-DD 字符串 + UTC 纪元日做运算，
 * 避免本地时区导致的跨天漂移（业务日切由服务端按 Asia/Shanghai 处理）。
 */

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  if (typeof key !== 'string' || !DATE_KEY_PATTERN.test(key)) {
    return null;
  }

  const [year, month, day] = key.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseDateKey(value) !== null;
}

/** 将 YYYY-MM-DD 转成 UTC 纪元日序号，非法输入抛错（属于编程错误，调用前应先用 isDateKey 校验） */
export function dateKeyToEpochDay(key: string): number {
  const parsed = parseDateKey(key);
  if (!parsed) {
    throw new Error(`非法的日期字符串：${key}`);
  }
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / MS_PER_DAY);
}

export function epochDayToDateKey(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addDays(key: string, days: number): string {
  return epochDayToDateKey(dateKeyToEpochDay(key) + days);
}

/** to - from 的天数差，from > to 时返回负数 */
export function diffInDays(from: string, to: string): number {
  return dateKeyToEpochDay(to) - dateKeyToEpochDay(from);
}

/** 含首尾的日期序列；from > to 时返回空数组 */
export function eachDateKey(from: string, to: string): string[] {
  if (!isDateKey(from) || !isDateKey(to)) {
    return [];
  }

  const start = dateKeyToEpochDay(from);
  const end = dateKeyToEpochDay(to);
  const keys: string[] = [];

  for (let day = start; day <= end; day += 1) {
    keys.push(epochDayToDateKey(day));
  }

  return keys;
}

/** 本地“今天”，用于默认筛选区间的展示口径 */
export function getTodayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export interface DateRange {
  from: string;
  to: string;
}

/** 以 to 为终点向前推 days - 1 天 */
export function getDefaultDateRange(todayKey: string, days: number): DateRange {
  return { from: addDays(todayKey, -(days - 1)), to: todayKey };
}

/** 整体平移区间，用于取环比对照期 */
export function shiftDateRange(range: DateRange, days: number): DateRange {
  return { from: addDays(range.from, days), to: addDays(range.to, days) };
}

/**
 * 区间纠偏：非法输入回退到默认区间，起止颠倒时交换，超长时保留 end 并向前收窄。
 * 前端与 mock/后端必须使用同一套纠偏规则，避免口径不一致。
 */
export function normalizeDateRange(
  from: string,
  to: string,
  maxDays: number,
  todayKey: string = getTodayKey(),
  defaultDays: number = maxDays,
): DateRange {
  if (!isDateKey(from) || !isDateKey(to)) {
    return getDefaultDateRange(todayKey, defaultDays);
  }

  const [start, end] = diffInDays(from, to) < 0 ? [to, from] : [from, to];
  const span = diffInDays(start, end) + 1;

  if (span <= maxDays) {
    return { from: start, to: end };
  }

  return { from: addDays(end, -(maxDays - 1)), to: end };
}
