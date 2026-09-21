import type { DashboardQuery } from '@ai-ad-copilot/shared';

import {
  DEFAULT_CACHE_KEY_PREFIX,
  buildOverviewCacheKey,
  resolveCacheKeyPrefix,
} from './cache-key';

const BASE: DashboardQuery = { from: '2026-09-07', to: '2026-09-20' };

const EXPECTED_EQUIVALENT_KEY =
  'ai-ad-copilot:v1:overview:from=2026-09-07:to=2026-09-20:channels=douyin,baidu:planId=p-101';

describe('buildOverviewCacheKey', () => {
  it('按契约格式拼 key', () => {
    expect(
      buildOverviewCacheKey({ ...BASE, channels: ['douyin', 'baidu'], planId: 'p-101' }),
    ).toBe(EXPECTED_EQUIVALENT_KEY);
  });

  it('三组等价 query 映射到同一个 key（渠道顺序 / 重复渠道 / 大小写无关的顺序差异）', () => {
    const ordered: DashboardQuery = { ...BASE, channels: ['douyin', 'baidu'], planId: 'p-101' };
    const reversed: DashboardQuery = { ...BASE, channels: ['baidu', 'douyin'], planId: 'p-101' };
    const duplicated: DashboardQuery = {
      ...BASE,
      channels: ['baidu', 'douyin', 'baidu', 'douyin'],
      planId: 'p-101',
    };

    const keys = [ordered, reversed, duplicated].map((query) => buildOverviewCacheKey(query));

    expect(keys).toEqual([
      EXPECTED_EQUIVALENT_KEY,
      EXPECTED_EQUIVALENT_KEY,
      EXPECTED_EQUIVALENT_KEY,
    ]);
    expect(new Set(keys).size).toBe(1);
  });

  it('渠道按 AD_CHANNELS 声明顺序排列，而不是入参顺序', () => {
    expect(buildOverviewCacheKey({ ...BASE, channels: ['xiaohongshu', 'tencent', 'douyin'] })).toBe(
      'ai-ad-copilot:v1:overview:from=2026-09-07:to=2026-09-20:channels=douyin,tencent,xiaohongshu',
    );
  });

  it('省略渠道与空渠道数组等价（都不带 channels 段）', () => {
    const omitted = buildOverviewCacheKey({ ...BASE });
    const empty = buildOverviewCacheKey({ ...BASE, channels: [] });

    expect(omitted).toBe('ai-ad-copilot:v1:overview:from=2026-09-07:to=2026-09-20');
    expect(empty).toBe(omitted);
  });

  it('planId 为空 / 空白时省略该段', () => {
    const base = buildOverviewCacheKey({ ...BASE, channels: ['douyin'] });

    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin'], planId: '' })).toBe(base);
    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin'], planId: '   ' })).toBe(base);
    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin'], planId: 'p-101' })).toBe(
      `${base}:planId=p-101`,
    );
  });

  it('区间或渠道不同则 key 不同', () => {
    const base = buildOverviewCacheKey(BASE);

    expect(buildOverviewCacheKey({ ...BASE, to: '2026-09-21' })).not.toBe(base);
    expect(buildOverviewCacheKey({ ...BASE, from: '2026-09-06' })).not.toBe(base);
    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin'] })).not.toBe(base);
    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin', 'baidu'] })).not.toBe(base);
  });

  it('前缀可显式传入（便于测试隔离）', () => {
    expect(buildOverviewCacheKey({ ...BASE, channels: ['douyin'] }, 'test-1234')).toBe(
      'test-1234:v1:overview:from=2026-09-07:to=2026-09-20:channels=douyin',
    );
  });
});

describe('resolveCacheKeyPrefix', () => {
  it('默认前缀', () => {
    expect(resolveCacheKeyPrefix({})).toBe('ai-ad-copilot');
    expect(DEFAULT_CACHE_KEY_PREFIX).toBe('ai-ad-copilot');
  });

  it('CACHE_KEY_PREFIX 覆盖，并 trim 掉空白', () => {
    expect(resolveCacheKeyPrefix({ CACHE_KEY_PREFIX: 'test-run' })).toBe('test-run');
    expect(resolveCacheKeyPrefix({ CACHE_KEY_PREFIX: '  test-run  ' })).toBe('test-run');
  });

  it('空值 / 纯空白回落到默认前缀', () => {
    expect(resolveCacheKeyPrefix({ CACHE_KEY_PREFIX: '' })).toBe('ai-ad-copilot');
    expect(resolveCacheKeyPrefix({ CACHE_KEY_PREFIX: '   ' })).toBe('ai-ad-copilot');
  });
});
