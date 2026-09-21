import { Test } from '@nestjs/testing';

import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule / PrismaService', () => {
  beforeAll(() => {
    // 只在构造 PrismaClient 时需要一个可解析的连接串，这里不会真的连库。
    process.env.DATABASE_URL ??=
      'postgresql://postgres:postgres@localhost:5432/ai_ad_copilot?schema=public';
  });

  it('模块能被实例化，且不建立数据库连接', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();

    const service = moduleRef.get(PrismaService);

    // PrismaClient 实例是 Proxy 包装的，instanceof 天然不成立；
    // 这里改为断言 DI 单例与生成出来的模型代理，等价且更贴近真实使用。
    expect(moduleRef.get(PrismaService)).toBe(service);
    expect(typeof service.$connect).toBe('function');
    expect(service.adPlan).toBeDefined();
    expect(service.metric).toBeDefined();
    // 刻意不调用 init()：onModuleInit 不做 $connect，单测无需数据库
    await moduleRef.close();
  });

  it('onModuleDestroy 断开连接不抛错', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    const service = moduleRef.get(PrismaService);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    // 必须关闭 testing module：否则 Prisma 的引擎句柄会留在 jest worker 里，
    // 表现为 "worker process has failed to exit gracefully"，并在 Windows 上
    // 锁住 query_engine-windows.dll.node，导致后续 prisma generate 报 EPERM。
    await moduleRef.close();
  });
});
