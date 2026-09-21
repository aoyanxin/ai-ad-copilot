/**
 * overview 缓存集成测试：真实 Redis（key 前缀每次运行随机隔离）。
 */

import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';

import {
  createTestRedisClient,
  setupIntegrationTest,
  teardownIntegrationTest,
  type IntegrationContext,
} from '../../../test/setup';
import { DashboardRepository } from '../../modules/dashboard/dashboard.repository';
import { buildOverviewCacheKey } from './cache-key';

const RANGE_A = { from: '2026-09-07', to: '2026-09-20' };
const RANGE_B = { from: '2026-09-01', to: '2026-09-14' };
const RANGE_C = { from: '2026-08-01', to: '2026-08-31' };
const RANGE_D = { from: '2026-07-01', to: '2026-07-20' };

function overviewUrl(range: { from: string; to: string }, channels?: string): string {
  const base = `/api/dashboard/overview?from=${range.from}&to=${range.to}`;
  return channels ? `${base}&channels=${channels}` : base;
}

describe('overview 缓存（真实 Redis）', () => {
  let context: IntegrationContext;
  let app: INestApplication;
  let repository: DashboardRepository;
  let redis: Redis;
  let findFactsSpy: jest.SpyInstance;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    app = context.app;
    repository = app.get(DashboardRepository);
    redis = createTestRedisClient();
    findFactsSpy = jest.spyOn(repository, 'findAllFacts');
  });

  afterAll(async () => {
    findFactsSpy.mockRestore();
    redis.disconnect();
    await teardownIntegrationTest(context);
  });

  beforeEach(() => {
    findFactsSpy.mockClear();
  });

  it('同 query 连续两次请求：第二次命中缓存，不再查库', async () => {
    const url = overviewUrl(RANGE_A);

    const first = await request(app.getHttpServer()).get(url).expect(200);
    const callsAfterFirst = findFactsSpy.mock.calls.length;

    const second = await request(app.getHttpServer()).get(url).expect(200);

    // 首轮查库 2 次 = 当前区间 + 环比区间；第二轮新增 0 次
    expect(callsAfterFirst).toBe(2);
    expect(findFactsSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(second.body.data).toEqual(first.body.data);
    expect(second.body.data.metrics.impressions).toBe(13421138);
  });

  it('渠道顺序不同的等价 query 仍命中同一个缓存 key', async () => {
    const first = await request(app.getHttpServer())
      .get(overviewUrl(RANGE_B, 'douyin,baidu'))
      .expect(200);
    const callsAfterFirst = findFactsSpy.mock.calls.length;

    const second = await request(app.getHttpServer())
      .get(overviewUrl(RANGE_B, 'baidu,douyin,baidu'))
      .expect(200);

    expect(callsAfterFirst).toBe(2);
    expect(findFactsSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(second.body.data).toEqual(first.body.data);
    // 缓存命中的响应里 query 回显的是首次写入时的形态（顺序不同但语义等价），
    // 这是 key 归一化的已知取舍：前端只把它用于展示与校验。
    expect(second.body.data.query.channels).toEqual(['douyin', 'baidu']);
  });

  it('不同 query 会再次回源查库', async () => {
    await request(app.getHttpServer()).get(overviewUrl(RANGE_C)).expect(200);
    const afterFirst = findFactsSpy.mock.calls.length;

    await request(app.getHttpServer())
      .get(overviewUrl({ from: RANGE_C.from, to: '2026-08-30' }))
      .expect(200);

    expect(afterFirst).toBe(2);
    expect(findFactsSpy.mock.calls.length).toBe(4);
  });

  it('records 不进缓存：两次请求都会查库', async () => {
    const url = `/api/dashboard/records?from=${RANGE_D.from}&to=${RANGE_D.to}&page=1&pageSize=10`;
    const recordsSpy = jest.spyOn(repository, 'findPlanRecords');

    await request(app.getHttpServer()).get(url).expect(200);
    await request(app.getHttpServer()).get(url).expect(200);

    expect(recordsSpy).toHaveBeenCalledTimes(2);
    recordsSpy.mockRestore();
  });

  it('缓存 key 按契约生成，TTL ≈ 300 秒', async () => {
    await request(app.getHttpServer()).get(overviewUrl(RANGE_D)).expect(200);

    const key = buildOverviewCacheKey(RANGE_D, context.cacheKeyPrefix);

    expect(key).toBe(
      `${context.cacheKeyPrefix}:v1:overview:from=2026-07-01:to=2026-07-20`,
    );
    expect(await redis.exists(key)).toBe(1);

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);

    const payload = JSON.parse((await redis.get(key)) as string);
    expect(payload.metrics.impressions).toBeGreaterThan(0);
    expect(payload.updatedAt).toBe('2026-07-20T23:59:59+08:00');
  });

  it('缓存 key 前缀每次运行随机，与开发环境隔离', () => {
    expect(context.cacheKeyPrefix).toMatch(/^test-int-[0-9a-f]{8}$/);
    expect(context.cacheKeyPrefix.startsWith('ai-ad-copilot')).toBe(false);
  });
});
