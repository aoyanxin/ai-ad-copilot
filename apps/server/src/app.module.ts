import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheModule } from './common/cache/cache.module';
import { AdPlansModule } from './modules/ad-plans/ad-plans.module';
import { AiModule } from './modules/ai/ai.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // 全局加载 .env：Prisma（DATABASE_URL）与 Redis（REDIS_URL）都从这里取
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CacheModule,
    DashboardModule,
    AdPlansModule,
    AiModule,
    HealthModule,
  ],
})
export class AppModule {}
