import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheService } from './cache.service';
import { DEFAULT_REDIS_URL, RedisCacheService } from './redis-cache.service';

interface MockRedisClient {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  on: jest.Mock;
  disconnect: jest.Mock;
}

interface MockRedisModule {
  default: jest.Mock;
  __client: MockRedisClient;
}

jest.mock('ioredis', () => {
  const client = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  };

  return { __esModule: true, default: jest.fn(() => client), __client: client };
});

const redisModule = jest.requireMock('ioredis') as unknown as MockRedisModule;
const mockClient = redisModule.__client;
const RedisConstructor = redisModule.default;

function createService(redisUrl?: string): RedisCacheService {
  const configService = new ConfigService(
    redisUrl === undefined ? {} : { REDIS_URL: redisUrl },
  );
  return new RedisCacheService(configService);
}

describe('RedisCacheService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.get.mockResolvedValue(null);
    mockClient.set.mockResolvedValue('OK');
    mockClient.del.mockResolvedValue(1);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('是 CacheService 的实现', () => {
    expect(createService()).toBeInstanceOf(CacheService);
  });

  it('从 ConfigService 读 REDIS_URL，缺省用默认连接串', () => {
    createService();
    expect(RedisConstructor).toHaveBeenCalledWith(
      DEFAULT_REDIS_URL,
      expect.objectContaining({ enableOfflineQueue: false }),
    );

    jest.clearAllMocks();
    createService('redis://localhost:6379/1');
    expect(RedisConstructor).toHaveBeenCalledWith(
      'redis://localhost:6379/1',
      expect.objectContaining({ enableOfflineQueue: false }),
    );
  });

  it('回归：不能同时启用 lazyConnect 与 enableOfflineQueue:false（首个命令必然失败）', () => {
    createService();

    const options = RedisConstructor.mock.calls[0][1] as Record<string, unknown>;

    expect(options.lazyConnect).not.toBe(true);
    expect(options.enableOfflineQueue).toBe(false);
    expect(typeof options.retryStrategy).toBe('function');
  });

  it('set 用 EX 参数携带 TTL，值序列化为 JSON', async () => {
    const service = createService();

    await service.set('overview', { spend: 100 }, 300);

    expect(mockClient.set).toHaveBeenCalledWith(
      'overview',
      JSON.stringify({ spend: 100 }),
      'EX',
      300,
    );
  });

  it('TTL 非法时跳过写入', async () => {
    const service = createService();

    await service.set('overview', { spend: 100 }, 0);

    expect(mockClient.set).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('get 命中时返回反序列化后的值', async () => {
    mockClient.get.mockResolvedValue(JSON.stringify({ spend: 100 }));
    const service = createService();

    expect(await service.get('overview')).toEqual({ spend: 100 });
  });

  it('get 未命中返回 null', async () => {
    mockClient.get.mockResolvedValue(null);
    const service = createService();

    expect(await service.get('overview')).toBeNull();
  });

  it('get 遇到非法 JSON 返回 null 并告警', async () => {
    mockClient.get.mockResolvedValue('not-json');
    const service = createService();

    expect(await service.get('overview')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('不是合法 JSON'));
  });

  it('fail-open：Redis 读取失败按未命中处理，不抛错', async () => {
    mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createService();

    await expect(service.get('overview')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('缓存读取失败'));
  });

  it('fail-open：Redis 写入 / 删除失败不抛错', async () => {
    mockClient.set.mockRejectedValue(new Error('ECONNREFUSED'));
    mockClient.del.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createService();

    await expect(service.set('overview', { spend: 1 }, 300)).resolves.toBeUndefined();
    await expect(service.del('overview')).resolves.toBeUndefined();
  });

  it('fail-open：Redis 整体挂掉时 withCache 走 loader 并正常返回', async () => {
    mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
    mockClient.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createService();
    const loader = jest.fn().mockResolvedValue({ spend: 999 });

    await expect(service.withCache('overview', 300, loader)).resolves.toEqual({ spend: 999 });
    expect(loader).toHaveBeenCalledTimes(1);

    // 缓存不可用时每次都回源，这是 fail-open 的预期代价
    await service.withCache('overview', 300, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('del 正常调用 Redis', async () => {
    const service = createService();

    await service.del('overview');

    expect(mockClient.del).toHaveBeenCalledWith('overview');
  });

  it('onModuleDestroy 断开连接且不抛错', async () => {
    const service = createService();

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });
});
