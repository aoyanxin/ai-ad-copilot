import {
  isAdChannel,
  isAdPlanStatus,
  type AdChannel,
  type AdPlanStatus,
} from '@ai-ad-copilot/shared';

/**
 * 数据库里 channel / status 是自由字符串，契约由 shared 常量定义。
 * 读取时统一在这里收口：不在契约内的值属于数据异常，宁可抛错也不要
 * 让它以 `as AdChannel` 的形式静默流进聚合逻辑。
 */
export function toAdChannel(value: string, context: string): AdChannel {
  if (!isAdChannel(value)) {
    throw new Error(`数据异常：${context} 的 channel="${value}" 不在 AD_CHANNELS 契约内`);
  }
  return value;
}

export function toAdPlanStatus(value: string, context: string): AdPlanStatus {
  if (!isAdPlanStatus(value)) {
    throw new Error(`数据异常：${context} 的 status="${value}" 不在 AD_PLAN_STATUSES 契约内`);
  }
  return value;
}
