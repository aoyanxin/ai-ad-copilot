/**
 * 看板接口集成测试：真实 PostgreSQL（测试库）+ 真实 Redis。
 * 运行方式：pnpm.cmd --filter @ai-ad-copilot/server test:integration
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  INTEGRATION_TODAY,
  setupIntegrationTest,
  teardownIntegrationTest,
  type IntegrationContext,
} from '../../../test/setup';
import { aggregateMetrics, filterFacts } from './query-engine';

const FROM = '2026-09-07';
const WINDOW = { from: FROM, to: INTEGRATION_TODAY };
const PREVIOUS_WINDOW = { from: '2026-08-24', to: '2026-09-06' };

describe('Dashboard API（真实 PG + Redis）', () => {
  let context: IntegrationContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    app = context.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(context);
  });

  describe('GET /api/dashboard/overview', () => {
    it('结构与 seed 数据的聚合口径完全一致', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?from=${FROM}&to=${INTEGRATION_TODAY}`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.message).toBe('ok');

      const overview = response.body.data;

      // 与内存引擎（同一份 seed 数据）逐字段比对，锁住 SQL 过滤 + Decimal 转换的口径
      expect(overview.metrics).toEqual(
        aggregateMetrics(filterFacts(context.dataset.facts, WINDOW)),
      );
      expect(overview.query).toEqual(WINDOW);

      // 硬编码锚点：防止 DB 与引擎"一起错"
      expect(overview.metrics.impressions).toBe(13421138);
      expect(overview.metrics.clicks).toBe(446091);
      expect(overview.metrics.conversions).toBe(35543);
      expect(overview.metrics.spend).toBe(528299.74);
      expect(overview.metrics.revenue).toBe(3330302.15);
      expect(overview.metrics.roi).toBe(6.3);
      expect(overview.trend).toHaveLength(14);
      expect(overview.channels.map((item: { channel: string }) => item.channel)).toEqual([
        'douyin',
        'kuaishou',
        'tencent',
        'baidu',
        'xiaohongshu',
      ]);
      expect(overview.funnel.map((stage: { key: string }) => stage.key)).toEqual([
        'impression',
        'click',
        'conversion',
        'order',
      ]);
      expect(overview.funnel[3].value).toBe(18282);
      expect(overview.updatedAt).toBe('2026-09-20T23:59:59+08:00');
    });

    it('previous 是等长上一周期，且与 seed 数据一致', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?from=${FROM}&to=${INTEGRATION_TODAY}`)
        .expect(200);

      const expected = aggregateMetrics(
        filterFacts(context.dataset.facts, PREVIOUS_WINDOW),
      );

      expect(response.body.data.previous).toEqual(expected);
      expect(response.body.data.previous.spend).toBe(613018.69);
    });

    it('渠道过滤会真实改变聚合结果', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?from=${FROM}&to=${INTEGRATION_TODAY}&channels=douyin`)
        .expect(200);

      const expected = aggregateMetrics(
        filterFacts(context.dataset.facts, { ...WINDOW, channels: ['douyin'] }),
      );

      expect(response.body.data.metrics).toEqual(expected);
      expect(response.body.data.channels).toHaveLength(1);
      expect(response.body.data.query.channels).toEqual(['douyin']);
    });

    it('起止颠倒返回 40001', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-09-20&to=2026-09-01')
        .expect(400);

      expect(response.body.code).toBe(40001);
      expect(response.body.message).toContain('起始日期不能晚于结束日期');
    });

    it('跨度超过 90 天返回 40001', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-01-01&to=2026-06-01')
        .expect(400);

      expect(response.body.code).toBe(40001);
      expect(response.body.message).toContain('最多支持 90 天');
    });

    it('90 天边界合法', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-06-23&to=2026-09-20')
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.trend).toHaveLength(90);
    });

    it('非法日期格式返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-9-1&to=2026-09-20')
        .expect(400);

      expect(response.body.code).toBe(40000);
      expect(response.body.details).toContain(
        'from must match /^\\d{4}-\\d{2}-\\d{2}$/ regular expression',
      );
    });

    it('日历上不存在的日期返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-09-32&to=2026-09-20')
        .expect(400);

      expect(response.body.code).toBe(40000);
    });

    it('非法渠道返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?from=${FROM}&to=${INTEGRATION_TODAY}&channels=weibo`)
        .expect(400);

      expect(response.body.code).toBe(40000);
      expect(response.body.details?.[0]).toContain('channels must be one of the following values');
    });

    it('未知 query 参数被 whitelist 剥离', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?from=${FROM}&to=${INTEGRATION_TODAY}&rawSql=select1`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.query).toEqual(WINDOW);
    });
  });

  describe('GET /api/dashboard/records', () => {
    it('默认返回全部 30 个计划，updatedAt 取区间内 MAX(metric.date)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50`)
        .expect(200);

      expect(response.body.data.total).toBe(30);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pageSize).toBe(50);
      expect(response.body.data.list).toHaveLength(30);

      const ended = response.body.data.list.find(
        (record: { planId: string }) => record.planId === 'p-101',
      );
      const active = response.body.data.list.find(
        (record: { planId: string }) => record.planId === 'p-105',
      );

      // p-101 是 ended 计划：数据只到区间终点前 12 天
      expect(ended.status).toBe('ended');
      expect(ended.updatedAt).toBe('2026-09-08T23:59:59+08:00');
      expect(active.updatedAt).toBe('2026-09-20T23:59:59+08:00');
    });

    it('按消耗降序排序，且分页切片正确', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=2&sortField=spend&sortOrder=desc`,
        )
        .expect(200);

      expect(response.body.data.total).toBe(30);
      expect(response.body.data.list).toHaveLength(2);
      expect(response.body.data.list[0].spend).toBeGreaterThanOrEqual(
        response.body.data.list[1].spend,
      );

      const all = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&sortField=spend&sortOrder=desc`,
        )
        .expect(200);

      const spends = all.body.data.list.map((record: { spend: number }) => record.spend);
      expect([...spends].sort((left: number, right: number) => right - left)).toEqual(spends);
    });

    it('升序排序', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&sortField=roi&sortOrder=asc`,
        )
        .expect(200);

      const rois = response.body.data.list.map((record: { roi: number }) => record.roi);
      expect([...rois].sort((left: number, right: number) => left - right)).toEqual(rois);
    });

    it('状态列多选筛选', async () => {
      const active = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&statuses=active`,
        )
        .expect(200);
      const ended = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&statuses=ended`,
        )
        .expect(200);
      const both = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&statuses=active,ended`,
        )
        .expect(200);

      expect(active.body.data.total).toBe(16);
      expect(ended.body.data.total).toBe(5);
      expect(both.body.data.total).toBe(21);
    });

    it('计划名关键字筛选（不区分大小写/子串匹配）', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&keyword=大促`,
        )
        .expect(200);

      expect(response.body.data.total).toBe(2);
      response.body.data.list.forEach((record: { planName: string }) => {
        expect(record.planName).toContain('大促');
      });
    });

    it('planId 过滤只返回该计划', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=10&planId=p-101`,
        )
        .expect(200);

      expect(response.body.data.total).toBe(1);
      expect(response.body.data.list[0].planId).toBe('p-101');
      expect(response.body.data.list[0].spend).toEqual(
        aggregateMetrics(
          filterFacts(context.dataset.facts, { ...WINDOW, planId: 'p-101' }),
        ).spend,
      );
    });

    it('渠道筛选支持逗号与重复 key 两种写法', async () => {
      const comma = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&channels=douyin,baidu`,
        )
        .expect(200);
      const repeated = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=50&channels=douyin&channels=baidu`,
        )
        .expect(200);

      expect(comma.body.data.total).toBe(12);
      expect(repeated.body.data.total).toBe(12);
    });

    it('分页越界返回空列表但 total 不变', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=99&pageSize=10`)
        .expect(200);

      expect(response.body.data.total).toBe(30);
      expect(response.body.data.list).toEqual([]);
      expect(response.body.data.page).toBe(99);
    });

    it('非法分页参数返回 40000', async () => {
      const zero = await request(app.getHttpServer())
        .get(`/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=0&pageSize=10`)
        .expect(400);
      const tooLarge = await request(app.getHttpServer())
        .get(`/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=101`)
        .expect(400);
      const notNumber = await request(app.getHttpServer())
        .get(`/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=abc`)
        .expect(400);

      expect(zero.body.code).toBe(40000);
      expect(tooLarge.body.code).toBe(40000);
      expect(notNumber.body.code).toBe(40000);
    });

    it('非法排序字段返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/dashboard/records?from=${FROM}&to=${INTEGRATION_TODAY}&page=1&pageSize=10&sortField=planName`,
        )
        .expect(400);

      expect(response.body.code).toBe(40000);
    });

    it('ended 计划在数据截止之后就查不到（空态）', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/api/dashboard/records?from=2026-09-15&to=2026-09-20&page=1&pageSize=10&planId=p-101',
        )
        .expect(200);

      expect(response.body.data.total).toBe(0);
      expect(response.body.data.list).toEqual([]);
    });

    it('overview 在空区间返回全 0，previous 为 null', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/dashboard/overview?from=2026-09-15&to=2026-09-20&planId=p-101')
        .expect(200);

      expect(response.body.data.metrics).toEqual({
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        roi: 0,
      });
      expect(response.body.data.previous).toBeNull();
      expect(response.body.data.channels).toEqual([]);
      expect(response.body.data.trend).toHaveLength(6);
      expect(
        response.body.data.trend.every(
          (point: { spend: number; clicks: number }) => point.spend === 0 && point.clicks === 0,
        ),
      ).toBe(true);
    });
  });
});
