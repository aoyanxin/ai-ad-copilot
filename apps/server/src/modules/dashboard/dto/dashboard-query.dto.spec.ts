import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { DashboardQueryDto } from './dashboard-query.dto';

/** 与全局 ValidationPipe 保持一致：whitelist 剥离未知字段 + transform 让 @Transform/@Type 生效 */
async function validateQuery<T extends object>(
  type: new () => T,
  raw: Record<string, unknown>,
): Promise<{ dto: T; errors: ValidationError[] }> {
  const dto = plainToInstance(type, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

function errorProps(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

/** 只统计真正有值的字段：class-transformer 会给可选字段留下 undefined 键 */
function definedKeys(dto: object): string[] {
  return Object.keys(dto)
    .filter((key) => (dto as unknown as Record<string, unknown>)[key] !== undefined)
    .sort();
}

describe('DashboardQueryDto', () => {
  it('接受合法的 from / to', async () => {
    const { dto, errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
    });

    expect(errors).toEqual([]);
    expect(dto.from).toBe('2026-09-07');
    expect(dto.to).toBe('2026-09-20');
    expect(dto.channels).toBeUndefined();
    expect(dto.planId).toBeUndefined();
  });

  it('拒绝格式不合法的日期', async () => {
    const { errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-9-1',
      to: '2026/09/20',
    });

    expect(errorProps(errors).sort()).toEqual(['from', 'to']);
  });

  it('拒绝日历上不存在的日期', async () => {
    const month = await validateQuery(DashboardQueryDto, {
      from: '2026-13-01',
      to: '2026-09-20',
    });
    const day = await validateQuery(DashboardQueryDto, {
      from: '2026-09-32',
      to: '2026-09-20',
    });
    const leap = await validateQuery(DashboardQueryDto, {
      from: '2025-02-29',
      to: '2026-09-20',
    });

    expect(errorProps(month.errors)).toEqual(['from']);
    expect(errorProps(day.errors)).toEqual(['from']);
    expect(errorProps(leap.errors)).toEqual(['from']);
  });

  it('把逗号分隔的 channels 拆成数组', async () => {
    const { dto, errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: 'douyin,baidu',
    });

    expect(errors).toEqual([]);
    expect(dto.channels).toEqual(['douyin', 'baidu']);
  });

  it('支持重复 query（数组）以及数组元素再含逗号的写法', async () => {
    const repeated = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['douyin', 'baidu'],
    });
    const mixed = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ['douyin,baidu', 'tencent'],
    });

    expect(repeated.dto.channels).toEqual(['douyin', 'baidu']);
    expect(mixed.dto.channels).toEqual(['douyin', 'baidu', 'tencent']);
  });

  it('去除空白项，空字符串等价于不传（全部渠道）', async () => {
    const padded = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: ' douyin , , baidu ',
    });
    const empty = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: '',
    });

    expect(padded.dto.channels).toEqual(['douyin', 'baidu']);
    expect(empty.errors).toEqual([]);
    expect(empty.dto.channels).toEqual([]);
  });

  it('拒绝不在 AD_CHANNELS 里的渠道', async () => {
    const { errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      channels: 'douyin,weibo',
    });

    expect(errorProps(errors)).toEqual(['channels']);
  });

  it('接受可选的 planId', async () => {
    const { dto, errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      planId: 'p-101',
    });

    expect(errors).toEqual([]);
    expect(dto.planId).toBe('p-101');
  });

  it('whitelist 剥离未知字段，不进 DTO', async () => {
    const { dto, errors } = await validateQuery(DashboardQueryDto, {
      from: '2026-09-07',
      to: '2026-09-20',
      unknownField: 'inject',
      limit: 9999,
    });

    expect(errors).toEqual([]);
    expect(definedKeys(dto)).toEqual(['from', 'to']);
    expect((dto as unknown as Record<string, unknown>).unknownField).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).limit).toBeUndefined();
  });
});
