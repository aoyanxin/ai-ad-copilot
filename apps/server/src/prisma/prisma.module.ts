import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * 全局数据库模块：业务模块只注入 PrismaService，不需要重复 import。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
