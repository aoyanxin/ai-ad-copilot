import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { DashboardRecordsQueryDto } from './dashboard-records-query.dto';

const BASE = { from: '2026-09-07', to: '2026-09-20' };

async function validateQuery(
  raw: Record<string, unknown>,
): Promise<{ dto: DashboardRecordsQueryDto; errors: ValidationError[] }> {
  const dto = plainToInstance(DashboardRecordsQueryDto, raw);
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

describe('DashboardRecordsQueryDto', () => {
  it('继承公共筛选字段，并把分页参数转成数字', async () => {
    const { dto, errors } = await validateQuery({
      ...BASE,
      page: '2',
      pageSize: '50',
      sortField: 'roi',
      sortOrder: 'asc',
      statuses: 'active,paused',
      keyword: '上新',
    });

    expect(errors).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
    expect(typeof dto.page).toBe('number');
    expect(dto.sortField).toBe('roi');
    expect(dto.sortOrder).toBe('asc');
    expect(dto.statuses).toEqual(['active', 'paused']);
    expect(dto.keyword).toBe('上新');
  });

  it('page / pageSize 缺失时报错', async () => {
    const { errors } = await validateQuery({ ...BASE });

    expect(errorProps(errors).sort()).toEqual(['page', 'pageSize']);
  });

  it('拒绝非法 page', async () => {
    const zero = await validateQuery({ ...BASE, page: '0', pageSize: '10' });
    const negative = await validateQuery({ ...BASE, page: '-1', pageSize: '10' });
    const fraction = await validateQuery({ ...BASE, page: '1.5', pageSize: '10' });

    expect(errorProps(zero.errors)).toEqual(['page']);
    expect(errorProps(negative.errors)).toEqual(['page']);
    expect(errorProps(fraction.errors)).toEqual(['page']);
  });

  it('拒绝非法 pageSize', async () => {
    const notNumber = await validateQuery({ ...BASE, page: '1', pageSize: 'abc' });
    const negative = await validateQuery({ ...BASE, page: '1', pageSize: '-1' });
    const tooLarge = await validateQuery({ ...BASE, page: '1', pageSize: '101' });

    expect(errorProps(notNumber.errors)).toEqual(['pageSize']);
    expect(errorProps(negative.errors)).toEqual(['pageSize']);
    expect(errorProps(tooLarge.errors)).toEqual(['pageSize']);
  });

  it('pageSize 上边界 100 合法', async () => {
    const { dto, errors } = await validateQuery({ ...BASE, page: '1', pageSize: '100' });

    expect(errors).toEqual([]);
    expect(dto.pageSize).toBe(100);
  });

  it('拒绝不在白名单内的 sortField / sortOrder', async () => {
    const field = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      sortField: 'planName',
    });
    const order = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      sortOrder: 'ascend',
    });

    expect(errorProps(field.errors)).toEqual(['sortField']);
    expect(errorProps(order.errors)).toEqual(['sortOrder']);
  });

  it('排序参数可省略', async () => {
    const { dto, errors } = await validateQuery({ ...BASE, page: '1', pageSize: '10' });

    expect(errors).toEqual([]);
    expect(dto.sortField).toBeUndefined();
    expect(dto.sortOrder).toBeUndefined();
  });

  it('拒绝非法 statuses', async () => {
    const { errors } = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      statuses: 'active,archived',
    });

    expect(errorProps(errors)).toEqual(['statuses']);
  });

  it('keyword 长度上限 50', async () => {
    const atLimit = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      keyword: 'a'.repeat(50),
    });
    const overLimit = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      keyword: 'a'.repeat(51),
    });

    expect(atLimit.errors).toEqual([]);
    expect(errorProps(overLimit.errors)).toEqual(['keyword']);
  });

  it('whitelist 剥离未知字段', async () => {
    const { dto, errors } = await validateQuery({
      ...BASE,
      page: '1',
      pageSize: '10',
      rawSql: 'select 1',
    });

    expect(errors).toEqual([]);
    expect((dto as unknown as Record<string, unknown>).rawSql).toBeUndefined();
    expect(definedKeys(dto)).toEqual(['from', 'page', 'pageSize', 'to']);
  });
});
