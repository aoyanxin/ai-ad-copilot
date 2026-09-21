/**
 * AI 接口集成测试：真实 PostgreSQL + Redis，LLM 固定 mock（绝不打真实 API）。
 * 运行方式：pnpm.cmd test:integration
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  frameNames,
  mergeDeltaText,
  parseSseFrames,
} from '../../../test/sse-test-utils';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  type IntegrationContext,
} from '../../../test/setup';
import { ErrorCode } from '../../common/constants/error-code';
import { MockLlmClient } from './llm/mock-llm-client';

const VALID_BODY = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  channel: 'douyin',
  tone: 'professional',
};

describe('AI 接口（真实 PG + Redis，LLM=mock）', () => {
  let context: IntegrationContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    app = context.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(context);
  });

  it('copywriting/stream 的帧序列与契约一致', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send(VALID_BODY)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(response.text);
    const names = frames.map((frame) => frame.event);

    // meta → (variant → delta* → variant-done)* → done
    expect(names[0]).toBe('meta');
    expect(frames[0].data).toMatchObject({ model: 'mock-llm', variantCount: 3 });
    expect(names[names.length - 1]).toBe('done');
    expect(names.filter((name) => name === 'variant')).toHaveLength(3);
    expect(names.filter((name) => name === 'variant-done')).toHaveLength(3);
    expect(names).not.toContain('error');

    const texts = mergeDeltaText(response.text);
    expect([...texts.keys()].sort()).toEqual([0, 1, 2]);
    texts.forEach((text) => expect(text.length).toBeGreaterThan(0));
  });

  it('rewrite/stream 只发 meta → delta* → done', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/rewrite/stream')
      .send({ original: '秋季风衣上新，现在下单立减 50 元。', instruction: '语气更紧迫' })
      .expect(200);

    const names = frameNames(response.text);

    expect(names[0]).toBe('meta');
    expect(names[names.length - 1]).toBe('done');
    expect(names).not.toContain('variant');
    expect(mergeDeltaText(response.text).get(0)?.length).toBeGreaterThan(0);
  });

  it('score 返回结构化打分结果', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/score')
      .send({ copies: ['第一条文案', '第二条文案'] })
      .expect(200);

    expect(response.body.code).toBe(0);
    expect(response.body.data).toHaveLength(2);
    response.body.data.forEach((item: { index: number; score: number; reasons: string[] }) => {
      expect(typeof item.score).toBe('number');
      expect(item.reasons.length).toBeGreaterThan(0);
    });
  });

  it('入参非法返回 40000（DTO 校验在流开始之前）', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send({ tone: 'casual' })
      .expect(400);
    const tooManyVariants = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send({ ...VALID_BODY, variants: 5 })
      .expect(400);

    expect(missing.body.code).toBe(ErrorCode.BAD_REQUEST);
    expect(tooManyVariants.body.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('未知字段被 whitelist 剥离（前端传多余字段不影响生成）', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send({ ...VALID_BODY, apiKey: 'sk-should-not-pass' })
      .expect(200);

    expect(frameNames(response.text)[0]).toBe('meta');
  });
});

describe('AI 接口错误路径（真实 PG + Redis，上游限流）', () => {
  let context: IntegrationContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await setupIntegrationTest({
      llmClient: new MockLlmClient({ chunkDelayMs: 0, failWith: 'rate_limit' }),
    });
    app = context.app;
  });

  afterAll(async () => {
    await teardownIntegrationTest(context);
  });

  it('限流时用 error 帧终止，帧序列里没有 done', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send(VALID_BODY)
      .expect(200);

    const frames = parseSseFrames(response.text);
    const names = frames.map((frame) => frame.event);
    const errorFrame = frames.find((frame) => frame.event === 'error');

    expect(errorFrame?.data.code).toBe(ErrorCode.RATE_LIMITED);
    expect(names[0]).toBe('meta');
    expect(names[names.length - 1]).toBe('error');
    expect(names).not.toContain('done');
  });
});
