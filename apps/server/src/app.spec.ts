import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ErrorCode } from './common/constants/error-code';

describe('AppModule (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health 返回统一响应结构', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body.code).toBe(ErrorCode.SUCCESS);
    expect(response.body.message).toBe('ok');
    expect(response.body.data.status).toBe('ok');
  });

  it('未知路由返回统一错误结构', async () => {
    const response = await request(app.getHttpServer()).get('/api/not-exist').expect(404);

    expect(response.body.code).toBe(ErrorCode.NOT_FOUND);
    expect(response.body.path).toBe('/api/not-exist');
  });
});
