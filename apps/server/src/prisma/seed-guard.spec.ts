import { assertSeedAllowed, resolveDatabaseName } from './seed-guard';

const TEST_URL = 'postgresql://postgres:secret@localhost:5432/ai_ad_copilot_test?schema=public';
const DEV_URL = 'postgresql://postgres:secret@localhost:5432/ai_ad_copilot?schema=public';

describe('resolveDatabaseName', () => {
  it('解析出库名，忽略 query 参数', () => {
    expect(resolveDatabaseName(TEST_URL)).toBe('ai_ad_copilot_test');
    expect(resolveDatabaseName(DEV_URL)).toBe('ai_ad_copilot');
  });

  it('缺失或非法输入返回 null', () => {
    expect(resolveDatabaseName(undefined)).toBeNull();
    expect(resolveDatabaseName('')).toBeNull();
    expect(resolveDatabaseName('not-a-url')).toBeNull();
    expect(resolveDatabaseName('postgresql://postgres@localhost:5432/')).toBeNull();
  });
});

describe('assertSeedAllowed', () => {
  it('测试库直接放行', () => {
    expect(assertSeedAllowed(TEST_URL, undefined)).toBe('ai_ad_copilot_test');
    expect(assertSeedAllowed(TEST_URL, '0')).toBe('ai_ad_copilot_test');
  });

  it('非测试库必须显式 ALLOW_SEED=1', () => {
    expect(() => assertSeedAllowed(DEV_URL, undefined)).toThrow('不是测试库');
    expect(() => assertSeedAllowed(DEV_URL, '0')).toThrow('不是测试库');
    expect(() => assertSeedAllowed(DEV_URL, 'true')).toThrow('不是测试库');
    expect(assertSeedAllowed(DEV_URL, '1')).toBe('ai_ad_copilot');
  });

  it('缺少或无法解析连接串时拒绝执行', () => {
    expect(() => assertSeedAllowed(undefined, '1')).toThrow('缺少 DATABASE_URL');
    expect(() => assertSeedAllowed('not-a-url', '1')).toThrow('无法从 DATABASE_URL 解析出库名');
  });
});
