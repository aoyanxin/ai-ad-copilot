/**
 * 缓存抽象：Nest 依赖注入用抽象类而不是 interface（运行时可作为 token）。
 * 当前生产实现是 RedisCacheService，单测用 MemoryCacheService 顶上，
 * 以后换 Memcached / 本地 LRU 只需要新增一个子类并改 CacheModule 的绑定。
 */
export abstract class CacheService {
  /** 命中返回反序列化后的值，未命中或缓存不可用一律返回 null（fail-open） */
  abstract get<T>(key: string): Promise<T | null>;

  /** 写入并设置 TTL（秒） */
  abstract set(key: string, value: unknown, ttlSeconds: number): Promise<void>;

  /** 删除单个 key */
  abstract del(key: string): Promise<void>;

  /**
   * 读缓存 -> 未命中则回源 -> 写缓存。
   *
   * 约定：实现方遇到缓存故障必须"当作未命中"返回 null，并且 set / del 不抛错，
   * 这样 withCache 天然 fail-open —— Redis 挂掉时接口只是退化成直查数据库，不会 500。
   * 注意 null 会被当成未命中，因此不要缓存 null 语义的返回值。
   */
  async withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
