import { Injectable } from '@nestjs/common';

import { CacheService } from './cache.service';

interface MemoryEntry {
  /** 序列化后的值：与 Redis 实现保持一致，天然隔离引用 */
  payload: string;
  expiresAt: number;
}

/**
 * 内存缓存实现，用于不依赖 Redis 的单测与本地降级。
 * TTL 采用惰性过期（读取时判断），不额外持有定时器。
 */
@Injectable()
export class MemoryCacheService extends CacheService {
  private readonly store = new Map<string, MemoryEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    try {
      return JSON.parse(entry.payload) as T;
    } catch {
      this.store.delete(key);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      this.store.delete(key);
      return;
    }

    const payload = JSON.stringify(value);
    if (payload === undefined) {
      this.store.delete(key);
      return;
    }

    this.store.set(key, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
