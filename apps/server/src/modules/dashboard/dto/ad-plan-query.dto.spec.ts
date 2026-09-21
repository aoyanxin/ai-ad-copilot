import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { AdPlanQueryDto } from './ad-plan-query.dto';

async function validateQuery(
  raw: Record<string, unknown>,
): Promise<{ dto: AdPlanQueryDto; errors: ValidationError[] }> {
  const dto = plainToInstance(AdPlanQueryDto, raw);
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

describe('AdPlanQueryDto', () => {
  it('三个条件都可选，空 query 合法', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toEqual([]);
    expect(dto.channels).toBeUndefined();
    expect(dto.statuses).toBeUndefined();
    expect(dto.keyword).toBeUndefined();
  });

  it('channels 支持逗号与重复 key，并校验白名单', async () => {
    const comma = await validateQuery({ channels: 'douyin,tencent' });
    const repeated = await validateQuery({ channels: ['douyin', 'tencent'] });
    const invalid = await validateQuery({ channels: 'weibo' });

    expect(comma.dto.channels).toEqual(['douyin', 'tencent']);
    expect(repeated.dto.channels).toEqual(['douyin', 'tencent']);
    expect(errorProps(invalid.errors)).toEqual(['channels']);
  });

  it('statuses 校验 AD_PLAN_STATUSES 白名单', async () => {
    const valid = await validateQuery({ statuses: 'active,ended' });
    const invalid = await validateQuery({ statuses: 'active,archived' });

    expect(valid.dto.statuses).toEqual(['active', 'ended']);
    expect(errorProps(invalid.errors)).toEqual(['statuses']);
  });

  it('keyword 必须是字符串且不超过 50 字', async () => {
    const atLimit = await validateQuery({ keyword: 'a'.repeat(50) });
    const overLimit = await validateQuery({ keyword: 'a'.repeat(51) });

    expect(atLimit.errors).toEqual([]);
    expect(errorProps(overLimit.errors)).toEqual(['keyword']);
  });

  it('whitelist 剥离未知字段', async () => {
    const { dto, errors } = await validateQuery({ channels: 'douyin', debug: '1' });

    expect(errors).toEqual([]);
    expect((dto as unknown as Record<string, unknown>).debug).toBeUndefined();
    expect(definedKeys(dto)).toEqual(['channels']);
  });
});
