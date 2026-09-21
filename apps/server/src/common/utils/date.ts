/**
 * 日期工具：统一使用 YYYY-MM-DD 字符串 + UTC 纪元日做运算，
 * 避免本地时区导致的跨天漂移（业务日切按 Asia/Shanghai）。
 *
 * 与 web 端 apps/web/src/utils/date.ts 保持同一套语义；
 * 数据库侧 @db.Date 用"UTC 零点"表示业务日，所以
 * 禁止 new Date('2026-09-07') —— 它会被解析成 UTC 零点再按本地时区展示，
 * 在 UTC+8 环境下会退回到前一天。一律走 dateKeyToUtcDate。
 */

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** 业务时区 Asia/Shanghai：UTC+8，无夏令时 */
const BUSINESS_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface DateRange {
  from: string;
  to: string;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function parseDateKey(key: string): DateParts | null {
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

/** 将 YYYY-MM-DD 转成 UTC 纪元日序号，非法输入抛错（属于编程错误，调用前应先用 isDateKey 校验） */
function dateKeyToEpochDay(key: string): number {
  const parsed = parseDateKey(key);
  if (!parsed) {
    throw new Error(`非法的日期字符串：${key}`);
  }
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / MS_PER_DAY);
}

function epochDayToDateKey(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** 是否为合法的 YYYY-MM-DD（含真实日历校验，2026-02-30 会被拒绝） */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseDateKey(value) !== null;
}

/** 日期加减，跨月 / 跨年安全 */
export function addDays(key: string, days: number): string {
  return epochDayToDateKey(dateKeyToEpochDay(key) + days);
}

/** to - from 的天数差，from > to 时返回负数 */
export function diffInDays(from: string, to: string): number {
  return dateKeyToEpochDay(to) - dateKeyToEpochDay(from);
}

/** 含首尾的日期序列；入参非法或 from > to 时返回空数组 */
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

/** 整体平移区间，用于取环比对照期 */
export function shiftDateRange(range: DateRange, days: number): DateRange {
  return { from: addDays(range.from, days), to: addDays(range.to, days) };
}

/**
 * 业务时区（Asia/Shanghai）下的"今天"，与运行机器的本地时区无关。
 * 中国全境不使用夏令时，所以固定 +8 偏移即可，不需要引入时区库。
 */
export function getShanghaiTodayKey(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + BUSINESS_TIMEZONE_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * YYYY-MM-DD -> UTC 零点的 Date，用于写入 / 查询 @db.Date 字段。
 * 非法输入抛错，避免脏数据落库。
 */
export function dateKeyToUtcDate(key: string): Date {
  const parsed = parseDateKey(key);
  if (!parsed) {
    throw new Error(`非法的日期字符串：${key}`);
  }
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

/**
 * @db.Date 返回的 Date -> YYYY-MM-DD。
 * 一律读 UTC 分量：Prisma 对 @db.Date 返回的就是 UTC 零点。
 */
export function utcDateToDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('非法的 Date 对象');
  }
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}
