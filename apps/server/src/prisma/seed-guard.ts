/**
 * seed 环境守卫：绝不允许脚本对着生产库 / 开发库直接清表，
 * 除非显式声明 ALLOW_SEED=1。
 */

export const ALLOW_SEED_ENV = 'ALLOW_SEED';

/** 从连接串里解析库名，解析失败返回 null（调用方按"不允许"处理） */
export function resolveDatabaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\//, '');
    return databaseName.length > 0 ? databaseName : null;
  } catch {
    return null;
  }
}

/**
 * 校验 seed 是否被允许执行，返回目标库名。
 * 规则：库名以 _test 结尾，或者显式设置 ALLOW_SEED=1。
 */
export function assertSeedAllowed(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  allowSeed: string | undefined = process.env[ALLOW_SEED_ENV],
): string {
  if (!databaseUrl) {
    throw new Error('seed 中止：缺少 DATABASE_URL（请通过 prisma db seed 运行，CLI 会加载 apps/server/.env）');
  }

  const databaseName = resolveDatabaseName(databaseUrl);
  if (!databaseName) {
    throw new Error('seed 中止：无法从 DATABASE_URL 解析出库名，拒绝清表');
  }

  if (!databaseName.endsWith('_test') && allowSeed !== '1') {
    throw new Error(
      `seed 中止：目标库 "${databaseName}" 不是测试库（库名需以 _test 结尾）。` +
        '确实要重建该库请显式设置 ALLOW_SEED=1。',
    );
  }

  return databaseName;
}
