import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { CopywritingRequestDto } from './copywriting.dto';
import { RewriteRequestDto } from './rewrite.dto';
import { ScoreRequestDto } from './score.dto';

async function validateDto<T extends object>(
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

const VALID_COPYWRITING = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  tone: 'professional',
};

describe('CopywritingRequestDto', () => {
  it('接受最小合法请求', async () => {
    const { dto, errors } = await validateDto(CopywritingRequestDto, VALID_COPYWRITING);

    expect(errors).toEqual([]);
    expect(dto.channel).toBeUndefined();
    expect(dto.variants).toBeUndefined();
  });

  it('接受渠道与版本数，并把 variants 转成数字', async () => {
    const { dto, errors } = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      channel: 'douyin',
      variants: '2',
    });

    expect(errors).toEqual([]);
    expect(dto.channel).toBe('douyin');
    expect(dto.variants).toBe(2);
  });

  it('拒绝缺失 / 过短的产品与人群', async () => {
    const missing = await validateDto(CopywritingRequestDto, { tone: 'casual' });
    const tooShort = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      product: 'a',
      audience: 'b',
    });

    expect(errorProps(missing.errors).sort()).toEqual(['audience', 'product']);
    expect(errorProps(tooShort.errors).sort()).toEqual(['audience', 'product']);
  });

  it('拒绝非法语气与渠道', async () => {
    const badTone = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      tone: 'formal',
    });
    const badChannel = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      channel: 'weibo',
    });

    expect(errorProps(badTone.errors)).toEqual(['tone']);
    expect(errorProps(badChannel.errors)).toEqual(['channel']);
  });

  it('版本数上限为 3（并发与成本硬上限）', async () => {
    const tooMany = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      variants: '4',
    });
    const zero = await validateDto(CopywritingRequestDto, { ...VALID_COPYWRITING, variants: '0' });

    expect(errorProps(tooMany.errors)).toEqual(['variants']);
    expect(errorProps(zero.errors)).toEqual(['variants']);
  });

  it('whitelist 剥离未知字段', async () => {
    const { dto, errors } = await validateDto(CopywritingRequestDto, {
      ...VALID_COPYWRITING,
      apiKey: 'sk-should-not-pass',
    });

    expect(errors).toEqual([]);
    expect((dto as unknown as Record<string, unknown>).apiKey).toBeUndefined();
  });
});

describe('RewriteRequestDto', () => {
  it('接受合法请求', async () => {
    const { errors } = await validateDto(RewriteRequestDto, {
      original: '秋季风衣上新，现在下单立减 50 元。',
      instruction: '语气更紧迫一些',
    });

    expect(errors).toEqual([]);
  });

  it('拒绝空原文与过短指令', async () => {
    const emptyOriginal = await validateDto(RewriteRequestDto, { original: '', instruction: '改' });
    const shortInstruction = await validateDto(RewriteRequestDto, {
      original: '原文',
      instruction: 'a',
    });

    expect(errorProps(emptyOriginal.errors)).toContain('original');
    expect(errorProps(shortInstruction.errors)).toContain('instruction');
  });

  it('原文超长会拒绝', async () => {
    const { errors } = await validateDto(RewriteRequestDto, {
      original: 'a'.repeat(2001),
      instruction: '改得更好',
    });

    expect(errorProps(errors)).toEqual(['original']);
  });
});

describe('ScoreRequestDto', () => {
  it('接受 1~3 条文案', async () => {
    const { errors } = await validateDto(ScoreRequestDto, { copies: ['文案一', '文案二'] });

    expect(errors).toEqual([]);
  });

  it('拒绝空数组与超过 3 条', async () => {
    const empty = await validateDto(ScoreRequestDto, { copies: [] });
    const tooMany = await validateDto(ScoreRequestDto, { copies: ['1', '2', '3', '4'] });

    expect(errorProps(empty.errors)).toEqual(['copies']);
    expect(errorProps(tooMany.errors)).toEqual(['copies']);
  });

  it('拒绝非字符串元素与空字符串元素', async () => {
    const notString = await validateDto(ScoreRequestDto, { copies: [123] });
    const emptyItem = await validateDto(ScoreRequestDto, { copies: [''] });

    expect(errorProps(notString.errors)).toEqual(['copies']);
    expect(errorProps(emptyItem.errors)).toEqual(['copies']);
  });
});
