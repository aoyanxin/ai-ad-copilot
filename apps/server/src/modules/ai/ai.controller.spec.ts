import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../../app.setup';
import { ErrorCode } from '../../common/constants/error-code';
import { frameNames, mergeDeltaText, parseSseFrames } from '../../../test/sse-test-utils';
import { AiModule } from './ai.module';
import { LLM_CLIENT } from './llm/llm-client.factory';
import { MockLlmClient } from './llm/mock-llm-client';

/**
 * 读取 SSE 原始报文：text/event-stream 属于 text/*，
 * 这里显式 buffer + 自定义 parse，避免依赖 superagent 的默认处理。
 */
function readSse(response: request.Response) {
  return parseSseFrames(response.text);
}

async function createApp(client: MockLlmClient, env: Record<string, string> = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    // AiService 依赖 ConfigService，而 providers 里声明的实例对 AiModule 内部不可见，
    // 所以按生产环境一样用全局 ConfigModule，再覆盖成测试用的配置。
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
  })
    .overrideProvider(LLM_CLIENT)
    .useValue(client)
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(env))
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

const VALID_BODY = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  channel: 'douyin',
  tone: 'professional',
};

describe('AiController（LLM_PROVIDER=mock）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(new MockLlmClient({ chunkDelayMs: 0 }));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/ai/copywriting/stream', () => {
    it('SSE 帧序列为 meta → variant → delta → variant-done → done', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/stream')
        .send(VALID_BODY)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');

      const frames = readSse(response);
      const names = frames.map((frame) => frame.event);

      expect(names[0]).toBe('meta');
      expect(frames[0].data).toMatchObject({ model: 'mock-llm', variantCount: 3 });
      expect(names[names.length - 1]).toBe('done');
      expect(names.filter((name) => name === 'variant')).toHaveLength(3);
      expect(names.filter((name) => name === 'variant-done')).toHaveLength(3);
      expect(names).not.toContain('error');
      expect(names.filter((name) => name === 'delta').length).toBeGreaterThan(0);

      expect(
        frames.filter((frame) => frame.event === 'variant').map((frame) => frame.data.index),
      ).toEqual([0, 1, 2]);
      expect(
        frames.filter((frame) => frame.event === 'variant-done').map((frame) => frame.data.index),
      ).toEqual([0, 1, 2]);
    });

    it('每个版本的 delta 按 index 分流，且三个版本内容不同', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/stream')
        .send(VALID_BODY)
        .expect(200);

      const texts = mergeDeltaText(response.text);

      expect([...texts.keys()].sort()).toEqual([0, 1, 2]);
      expect(texts.get(0)).not.toBe(texts.get(1));
      expect(texts.get(0)).not.toBe(texts.get(2));
    });

    it('variants=2 时只并发两路', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/stream')
        .send({ ...VALID_BODY, variants: 2 })
        .expect(200);

      const frames = readSse(response);

      expect(frames[0].data.variantCount).toBe(2);
      expect(frames.filter((frame) => frame.event === 'variant')).toHaveLength(2);
      expect(frames[frames.length - 1].data.variantCount).toBe(2);
    });

    it('variance 越界与缺字段返回 40000', async () => {
      const tooMany = await request(app.getHttpServer())
        .post('/api/ai/copywriting/stream')
        .send({ ...VALID_BODY, variants: 5 })
        .expect(400);
      const missing = await request(app.getHttpServer())
        .post('/api/ai/copywriting/stream')
        .send({ audience: 'x', tone: 'casual' })
        .expect(400);

      expect(tooMany.body.code).toBe(ErrorCode.BAD_REQUEST);
      expect(missing.body.code).toBe(ErrorCode.BAD_REQUEST);
      expect(Array.isArray(missing.body.details)).toBe(true);
    });
  });

  describe('POST /api/ai/copywriting/rewrite/stream', () => {
    it('改写流只有 meta → delta* → done', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/rewrite/stream')
        .send({ original: '秋季风衣上新，现在下单立减 50 元。', instruction: '语气更紧迫' })
        .expect(200);

      const names = frameNames(response.text);

      expect(names[0]).toBe('meta');
      expect(names[names.length - 1]).toBe('done');
      expect(names).not.toContain('variant');
      expect(names.filter((name) => name === 'delta').length).toBeGreaterThan(0);
    });

    it('指令过短返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/rewrite/stream')
        .send({ original: '原文', instruction: 'a' })
        .expect(400);

      expect(response.body.code).toBe(ErrorCode.BAD_REQUEST);
    });
  });

  describe('POST /api/ai/copywriting/score', () => {
    it('返回结构化打分结果（走统一响应包装）', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/score')
        .send({ copies: ['第一条文案', '第二条文案'] })
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        index: 0,
        reasons: expect.any(Array),
      });
      expect(typeof response.body.data[0].score).toBe('number');
    });

    it('空数组返回 40000', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ai/copywriting/score')
        .send({ copies: [] })
        .expect(400);

      expect(response.body.code).toBe(ErrorCode.BAD_REQUEST);
    });
  });
});

describe('AiController 上游失败路径', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(new MockLlmClient({ chunkDelayMs: 0, failWith: 'rate_limit' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('限流时用 error 帧终止流，且不再发 done', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/stream')
      .send(VALID_BODY)
      .expect(200);

    const frames = readSse(response);
    const errorFrame = frames.find((frame) => frame.event === 'error');

    expect(errorFrame).toBeDefined();
    expect(errorFrame?.data.code).toBe(ErrorCode.RATE_LIMITED);
    expect(frames[0].event).toBe('meta');
    expect(frames[frames.length - 1].event).toBe('error');
    expect(frames.some((frame) => frame.event === 'done')).toBe(false);
    expect(frames.some((frame) => frame.event === 'variant-done')).toBe(false);
  });

  it('打分同样是 42900', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/copywriting/score')
      .send({ copies: ['文案'] })
      .expect(429);

    expect(response.body.code).toBe(ErrorCode.RATE_LIMITED);
  });
});
