/**
 * 广告计划下拉接口集成测试：真实 PostgreSQL（测试库）+ 真实 Redis。
 */

import { AD_CHANNELS } from '@ai-ad-copilot/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  setupIntegrationTest,
  teardownIntegrationTest,
  type IntegrationContext,
} from '../../../test/setup';

describe('GET /api/ad-plans（真实 PG + Redis）', () => {
  let context: IntegrationContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    app = context.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(context);
  });

  it('无筛选返回 30 条，按 AD_CHANNELS 声明顺序 + planId 排序', async () => {
    const response = await request(app.getHttpServer()).get('/api/ad-plans').expect(200);

    expect(response.body.code).toBe(0);
    expect(response.body.data).toHaveLength(30);

    const channels = [...new Set(response.body.data.map((plan: { channel: string }) => plan.channel))];
    expect(channels).toEqual([...AD_CHANNELS]);

    expect(response.body.data.slice(0, 3).map((plan: { planId: string }) => plan.planId)).toEqual([
      'p-101',
      'p-102',
      'p-103',
    ]);
    // baidu 计划在 douyin 之后，证明用的是声明顺序而不是 PG 字母序
    const firstBaiduIndex = response.body.data.findIndex(
      (plan: { channel: string }) => plan.channel === 'baidu',
    );
    const lastDouyinIndex = response.body.data.map((plan: { channel: string }) => plan.channel).lastIndexOf('douyin');
    expect(firstBaiduIndex).toBeGreaterThan(lastDouyinIndex);
  });

  it('只返回 AdPlanOption 的四个字段', async () => {
    const response = await request(app.getHttpServer()).get('/api/ad-plans').expect(200);

    expect(Object.keys(response.body.data[0]).sort()).toEqual([
      'channel',
      'planId',
      'planName',
      'status',
    ]);
  });

  it('channels 过滤', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?channels=douyin')
      .expect(200);

    expect(response.body.data).toHaveLength(6);
    response.body.data.forEach((plan: { channel: string }) => {
      expect(plan.channel).toBe('douyin');
    });
  });

  it('statuses 过滤', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?statuses=ended')
      .expect(200);

    expect(response.body.data).toHaveLength(5);
    response.body.data.forEach((plan: { status: string }) => {
      expect(plan.status).toBe('ended');
    });
  });

  it('channels + statuses 组合过滤', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?channels=douyin&statuses=active')
      .expect(200);

    expect(response.body.data.map((plan: { planId: string }) => plan.planId)).toEqual([
      'p-102',
      'p-103',
      'p-104',
      'p-105',
    ]);
  });

  it('keyword 模糊匹配（大小写不敏感）', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?keyword=大促')
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    response.body.data.forEach((plan: { planName: string }) => {
      expect(plan.planName).toContain('大促');
    });
  });

  it('组合：渠道 + 状态 + 关键字', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?channels=kuaishou,tencent&statuses=active&keyword=大促')
      .expect(200);

    // 快手-节日大促(active) + 腾讯-节日大促(active)，顺序按 AD_CHANNELS 声明序
    expect(response.body.data.map((plan: { planId: string }) => plan.planId)).toEqual([
      'p-204',
      'p-305',
    ]);
  });

  it('非法渠道返回 40000', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?channels=weibo')
      .expect(400);

    expect(response.body.code).toBe(40000);
  });

  it('非法状态返回 40000', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ad-plans?statuses=archived')
      .expect(400);

    expect(response.body.code).toBe(40000);
  });
});
