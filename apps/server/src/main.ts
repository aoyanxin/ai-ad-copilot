import { APP_NAME } from '@ai-ad-copilot/shared';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { DEFAULT_PORT } from './common/constants/app';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));

  app.enableShutdownHooks();

  // 启动阶段 fail-fast：Prisma 平时惰性建连，这里显式探一次连接，
  // 让数据库配置错误 / 不可达在 listen 之前就暴露，而不是等第一个请求。
  await app.get(PrismaService).$connect();

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);

  Logger.log(`${APP_NAME} 服务已启动：http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
