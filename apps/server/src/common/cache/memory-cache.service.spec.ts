import { CacheService } from './cache.service';
import { MemoryCacheService } from './memory-cache.service';

const START = new Date('2026-09-20T00:00:00.000Z');

describe('MemoryCacheService', () => {
  let cache: MemoryCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    cache = new MemoryCacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('是 CacheService 的实现（依赖注入可用抽象类做 token）', () => {
    expect(cache).toBeInstanceOf(CacheService);
  });

  it('未命中返回 null', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('JSON 往返：写入对象读出来结构一致', async () => {
    const value = { metrics: { spend: 1234.56, roi: 2 }, trend: [{ date: '2026-09-20' }] };

    await cache.set('overview', value, 300);

    expect(await cache.get('overview')).toEqual(value);
  });

  it('写入后修改原对象不影响缓存（序列化隔离引用）', async () => {
    const value = { list: [1, 2, 3] };

    await cache.set('overview', value, 300);
    value.list.push(4);

    expect(await cache.get('overview')).toEqual({ list: [1, 2, 3] });
  });

  it('读出来的对象被修改也不污染缓存', async () => {
    await cache.set('overview', { list: [1, 2, 3] }, 300);

    const first = await cache.get<{ list: number[] }>('overview');
    first?.list.push(4);

    expect(await cache.get('overview')).toEqual({ list: [1, 2, 3] });
  });

  it('TTL 到期前后行为：到期瞬间即视为未命中', async () => {
    await cache.set('overview', 'value', 300);

    jest.setSystemTime(new Date(START.getTime() + 299_000));
    expect(await cache.get('overview')).toBe('value');

    jest.setSystemTime(new Date(START.getTime() + 300_000));
    expect(await cache.get('overview')).toBeNull();
  });

  it('TTL 非法时直接不缓存', async () => {
    await cache.set('zero', 'value', 0);
    await cache.set('negative', 'value', -1);
    await cache.set('nan', 'value', Number.NaN);

    expect(await cache.get('zero')).toBeNull();
    expect(await cache.get('negative')).toBeNull();
    expect(await cache.get('nan')).toBeNull();
  });

  it('del 删除指定 key', async () => {
    await cache.set('a', 1, 300);
    await cache.set('b', 2, 300);

    await cache.del('a');

    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBe(2);
  });
});

describe('CacheService.withCache', () => {
  let cache: MemoryCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    cache = new MemoryCacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('命中时不再调用 loader', async () => {
    await cache.set('overview', { spend: 100 }, 300);
    const loader = jest.fn().mockResolvedValue({ spend: 999 });

    const result = await cache.withCache('overview', 300, loader);

    expect(result).toEqual({ spend: 100 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('未命中时调用 loader 并写入缓存', async () => {
    const loader = jest.fn().mockResolvedValue({ spend: 999 });

    expect(await cache.withCache('overview', 300, loader)).toEqual({ spend: 999 });
    expect(loader).toHaveBeenCalledTimes(1);

    // 第二次依然能拿到结果，但 loader 不会被再次调用（TTL 内）
    await cache.withCache('overview', 300, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('过期后重新回源', async () => {
    const loader = jest.fn().mockResolvedValue({ spend: 1 });

    await cache.withCache('overview', 300, loader);
    jest.setSystemTime(new Date(START.getTime() + 300_000));
    await cache.withCache('overview', 300, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('loader 抛错时向上抛出，不写入半成品', async () => {
    const loader = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(cache.withCache('overview', 300, loader)).rejects.toThrow('db down');
    expect(await cache.get('overview')).toBeNull();
  });
});
