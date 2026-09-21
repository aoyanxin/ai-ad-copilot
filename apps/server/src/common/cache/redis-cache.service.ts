import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { CacheService } from './cache.service';

/** Redis 不可用时的默认连接串 */
export const DEFAULT_REDIS_URL = 'redis://localhost:6379/0';

export const REDIS_URL_CONFIG_KEY = 'REDIS_URL';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Redis 实现的 CacheService。
 *
 * 三条硬约束：
 * 1. fail-open：任何 Redis 故障都降级为"未命中 + 不写"，绝不把异常抛给业务；
 * 2. 启动不阻塞：连接在后台异步建立，失败只走 retryStrategy 重连，不阻塞 listen；
 * 3. 只能靠 ioredis 自己的重连策略恢复，不额外引入依赖。
 *
 * 注意这里刻意**不用** lazyConnect：lazyConnect + enableOfflineQueue:false 的组合
 * 会让"连接尚未建立时的第一个命令"直接失败（Stream isn't writeable ...），
 * 结果是缓存永远不生效——联调时真实踩到过。改为立即后台建连 + 失败快速降级。
 */
@Injectable()
export class RedisCacheService extends CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    super();

    const url = this.configService.get<string>(REDIS_URL_CONFIG_KEY) ?? DEFAULT_REDIS_URL;

    this.client = new Redis(url, {
      // 断线时不排队等待，直接失败 -> 触发 fail-open，避免请求被 Redis 拖死
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    // 必须挂 error 监听，否则连接错误会变成未捕获异常
    this.client.on('error', (error: unknown) => {
      this.logger.warn(`Redis 连接异常：${describeError(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.client.disconnect();
    } catch (error) {
      this.logger.warn(`Redis 断开连接失败：${describeError(error)}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    let raw: string | null;

    try {
      raw = await this.client.get(key);
    } catch (error) {
      this.logger.warn(`缓存读取失败，按未命中处理：${key}（${describeError(error)}）`);
      return null;
    }

    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`缓存内容不是合法 JSON，按未命中处理：${key}（${describeError(error)}）`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      this.logger.warn(`TTL 非法（${ttlSeconds}），跳过写入：${key}`);
      return;
    }

    const payload = JSON.stringify(value);
    if (payload === undefined) {
      this.logger.warn(`值无法序列化为 JSON，跳过写入：${key}`);
      return;
    }

    try {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`缓存写入失败，忽略：${key}（${describeError(error)}）`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`缓存删除失败，忽略：${key}（${describeError(error)}）`);
    }
  }
}
