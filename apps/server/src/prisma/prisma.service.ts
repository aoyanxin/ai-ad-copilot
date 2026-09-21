import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 客户端封装：跟随 Nest 生命周期创建 / 断开连接。
 *
 * onModuleInit 刻意不做 $connect：Prisma 在首次查询时会惰性建连，行为等价，
 * 这样"不依赖基础设施"的单测才能装配 AppModule。若需要在启动阶段对数据库
 * fail-fast，把注释里的 $connect 打开，并给这类单测加 overrideProvider(PrismaService)。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // 需要启动即校验数据库连通性时改为：await this.$connect();
    this.logger.debug('PrismaService 已就绪（首次查询时惰性建连）');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
