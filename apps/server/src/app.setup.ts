import { API_PREFIX } from '@ai-ad-copilot/shared';
import type { INestApplication } from '@nestjs/common';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * 全局配置集中在这里，保证 main.ts 与集成测试使用同一套装配。
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  return app;
}
