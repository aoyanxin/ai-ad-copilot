import { AD_CHANNELS, type AdChannel, type DashboardQuery } from '@ai-ad-copilot/shared';

/** 默认 key 前缀，可用环境变量 CACHE_KEY_PREFIX 覆盖（多环境共用同一 Redis 时隔离） */
export const DEFAULT_CACHE_KEY_PREFIX = 'ai-ad-copilot';

export const CACHE_KEY_PREFIX_ENV = 'CACHE_KEY_PREFIX';

/** key 结构版本号：序列化结构变化时 +1，避免读到老格式 */
export const OVERVIEW_CACHE_KEY_VERSION = 'v1';

/** 渠道去重并固定为 AD_CHANNELS 声明顺序，保证点击顺序不同也命中同一个 key */
function normalizeChannels(channels: readonly AdChannel[] | undefined): AdChannel[] {
  if (!channels || channels.length === 0) {
    return [];
  }

  const selected = new Set<AdChannel>(channels);
  return AD_CHANNELS.filter((channel) => selected.has(channel));
}

export function resolveCacheKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[CACHE_KEY_PREFIX_ENV]?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_CACHE_KEY_PREFIX;
}

/**
 * overview 缓存 key（纯函数）：
 * `<prefix>:<version>:overview:from=<from>:to=<to>[:channels=a,b][:planId=<id>]`
 *
 * 规范化规则：渠道按声明顺序去重拼接、空渠道整段省略、planId 为空整段省略，
 * 因此"渠道顺序不同 / 重复渠道 / 空渠道"都会落到同一个 key。
 */
export function buildOverviewCacheKey(
  query: DashboardQuery,
  prefix: string = resolveCacheKeyPrefix(),
): string {
  const segments = [
    prefix,
    OVERVIEW_CACHE_KEY_VERSION,
    'overview',
    `from=${query.from}`,
    `to=${query.to}`,
  ];

  const channels = normalizeChannels(query.channels);
  if (channels.length > 0) {
    segments.push(`channels=${channels.join(',')}`);
  }

  const planId = query.planId?.trim();
  if (planId) {
    segments.push(`planId=${planId}`);
  }

  return segments.join(':');
}
