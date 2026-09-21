import { API_PREFIX } from '@ai-ad-copilot/shared';
import { ValidationPipe, type INestApplication } from '@nestjs/common';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * 全局配置集中在这里，保证 main.ts 与集成测试使用同一套装配。
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  // whitelist 剥离 DTO 未声明的字段，transform 让 @Type / @Transform 生效
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  return app;
}
