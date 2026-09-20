import { APP_NAME } from '@ai-ad-copilot/shared';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { DEFAULT_PORT } from './common/constants/app';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);

  Logger.log(`${APP_NAME} 服务已启动：http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
