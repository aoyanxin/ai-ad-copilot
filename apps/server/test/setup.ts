/**
 * 集成测试脚手架（真实 PostgreSQL + Redis）。
 *
 * 这个文件被 test/jest-integration.json 的 setupFiles 加载，因此它在任何
 * int-spec 导入 AppModule 之前就完成了环境准备：
 * 1. 用 dotenv 读 .env.test（override），把 DATABASE_URL 指向测试库；
 * 2. 强校验库名以 _test 结尾——集成测试会清表重写，绝不允许打开发库；
 * 3. 生成随机 CACHE_KEY_PREFIX，隔离每次运行的缓存 key。
 *
 * 用例侧调用 setupIntegrationTest() / teardownIntegrationTest() 完成
 * "seed 测试库 -> 装配与生产一致的 Nest 应用 -> 收尾清理"。
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import Redis from 'ioredis';

import { writeSeedDataset } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DEFAULT_REDIS_URL } from '../src/common/cache/redis-cache.service';
import { resolveDatabaseName } from '../src/prisma/seed-guard';
import {
  buildSeedDataset,
  type SeedDataset,
} from '../src/modules/dashboard/seed-data';

/** 固定窗口终点：避免断言随运行日期漂移（seed 生成器完全确定性） */
export const INTEGRATION_TODAY = '2026-09-20';
export const INTEGRATION_RANGE_DAYS = 90;

const ENV_FILE = join(__dirname, '..', '.env.test');

function loadTestEnv(): { databaseUrl: string; redisUrl: string } {
  // 本地走 .env.test；CI 直接注入 DATABASE_URL / REDIS_URL（没有 .env.test）
  if (existsSync(ENV_FILE)) {
    const result = loadDotenv({ path: ENV_FILE, override: true });
    if (result.error) {
      throw result.error;
    }
  } else if (!process.env.DATABASE_URL) {
    throw new Error(
      `缺少 ${ENV_FILE}，且环境变量里没有 DATABASE_URL：本地请复制 apps/server/.env.test.example，CI 里由 job 的 env 注入`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';
  const databaseName = resolveDatabaseName(databaseUrl);

  if (!databaseName || !databaseName.endsWith('_test')) {
    throw new Error(
      `集成测试中止：.env.test 的 DATABASE_URL 必须指向以 _test 结尾的库（当前解析到 "${databaseName ?? '无法解析'}"）`,
    );
  }

  const cacheKeyPrefix = `test-int-${randomUUID().slice(0, 8)}`;
  process.env.NODE_ENV = 'test';
  process.env.CACHE_KEY_PREFIX = cacheKeyPrefix;

  return { databaseUrl, redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL };
}

/**
 * 模块加载即完成环境准备：setupFiles 阶段早于 int-spec 的 import，
 * 保证 ConfigModule / PrismaClient / ioredis 拿到的都是测试环境变量。
 */
const testEnv = loadTestEnv();

export const testCacheKeyPrefix = process.env.CACHE_KEY_PREFIX as string;

export interface IntegrationContext {
  app: INestApplication;
  /** seed 进测试库的数据集，用于与接口结果做口径比对 */
  dataset: SeedDataset;
  todayKey: string;
  cacheKeyPrefix: string;
  redisUrl: string;
}

function createRedisClient(): Redis {
  return new Redis(testEnv.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
}

/** 清掉本次运行前缀下的所有缓存 key（前缀随机，正常情况为空） */
export async function clearTestCacheKeys(): Promise<number> {
  const client = createRedisClient();
  const keys: string[] = [];

  try {
    const stream = client.scanStream({ match: `${testCacheKeyPrefix}:*`, count: 100 });
    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } finally {
    client.disconnect();
  }

  return keys.length;
}

/** 重置并 seed 测试库（deleteMany + createMany，事务内完成） */
export async function seedTestDatabase(dataset: SeedDataset): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await writeSeedDataset(prisma, dataset);
  } finally {
    await prisma.$disconnect();
  }
}

/** seed 测试库 + 启动与生产同一装配的 Nest 应用 */
export async function setupIntegrationTest(): Promise<IntegrationContext> {
  const dataset = buildSeedDataset(INTEGRATION_TODAY, INTEGRATION_RANGE_DAYS);
  await seedTestDatabase(dataset);
  await clearTestCacheKeys();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    dataset,
    todayKey: INTEGRATION_TODAY,
    cacheKeyPrefix: testCacheKeyPrefix,
    redisUrl: testEnv.redisUrl,
  };
}

export async function teardownIntegrationTest(context: IntegrationContext): Promise<void> {
  await clearTestCacheKeys();
  await context.app.close();
}

/** 供 TTL / key 断言直接使用（测试库连接串已由 .env.test 提供） */
export function createTestRedisClient(): Redis {
  return createRedisClient();
}

export { testEnv };
