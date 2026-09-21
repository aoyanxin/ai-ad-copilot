import { COPYWRITING_VARIANT_ANGLES } from '@ai-ad-copilot/shared';

import { LlmUpstreamError } from './llm/llm-client';
import {
  DEFAULT_MAX_COPY_CHARS,
  COPYWRITING_ANGLES_IN_ORDER,
  buildCopywritingPrompt,
  buildCopywritingRules,
  buildRewritePrompt,
  buildScorePrompt,
  parseScoreResult,
  resolveMaxCopyChars,
} from './prompt-templates';

describe('resolveMaxCopyChars', () => {
  it('缺省 / 非法值回落到 120，合法值生效', () => {
    expect(resolveMaxCopyChars(undefined)).toBe(DEFAULT_MAX_COPY_CHARS);
    expect(resolveMaxCopyChars('abc')).toBe(DEFAULT_MAX_COPY_CHARS);
    expect(resolveMaxCopyChars('0')).toBe(DEFAULT_MAX_COPY_CHARS);
    expect(resolveMaxCopyChars('80')).toBe(80);
    expect(resolveMaxCopyChars(60.9)).toBe(60);
  });
});

describe('buildCopywritingRules', () => {
  it('包含字数硬约束与合规要求', () => {
    const rules = buildCopywritingRules(90);

    expect(rules).toContain('90 个字符');
    expect(rules).toContain('行动号召');
    expect(rules).toContain('不得编造');
    expect(rules).toContain('绝对化用语');
  });

  it('缺省字数上限', () => {
    expect(buildCopywritingRules()).toContain(`${DEFAULT_MAX_COPY_CHARS} 个字符`);
  });
});

describe('buildCopywritingPrompt', () => {
  const base = {
    product: '秋季轻薄风衣',
    audience: '25-35 岁通勤女性',
    channel: 'douyin' as const,
    tone: 'professional' as const,
    angle: 'selling_point' as const,
  };

  it('把产品 / 人群 / 渠道 / 语气 / 角度都写进 prompt', () => {
    const messages = buildCopywritingPrompt(base);
    const user = messages[1].content;

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(user).toContain('秋季轻薄风衣');
    expect(user).toContain('25-35 岁通勤女性');
    expect(user).toContain('抖音信息流');
    expect(user).toContain('专业可信');
    expect(user).toContain('开门见山');
  });

  it('三个角度产生三份不同的 user prompt', () => {
    const prompts = COPYWRITING_VARIANT_ANGLES.map(
      (angle) => buildCopywritingPrompt({ ...base, angle })[1].content,
    );

    expect(new Set(prompts).size).toBe(COPYWRITING_VARIANT_ANGLES.length);
  });

  it('角度顺序与 shared 契约一致', () => {
    expect(COPYWRITING_ANGLES_IN_ORDER).toEqual([...COPYWRITING_VARIANT_ANGLES]);
  });

  it('同输入结果完全确定（可断言、可缓存）', () => {
    expect(buildCopywritingPrompt(base)).toEqual(buildCopywritingPrompt(base));
  });

  it('自定义字数上限会同时出现在 system 与 user 里', () => {
    const messages = buildCopywritingPrompt({ ...base, maxChars: 50 });

    expect(messages[0].content).toContain('50 个字符');
    expect(messages[1].content).toContain('50 个字符');
  });

  it('不传渠道时不出现渠道行', () => {
    const { channel: _channel, ...withoutChannel } = base;
    const user = buildCopywritingPrompt(withoutChannel)[1].content;

    expect(user).not.toContain('投放渠道');
  });
});

describe('buildRewritePrompt', () => {
  it('包含原文、指令与字数约束', () => {
    const messages = buildRewritePrompt('秋季风衣上新，现在下单立减 50', '把语气改得更紧迫', 80);
    const user = messages[1].content;

    expect(user).toContain('秋季风衣上新，现在下单立减 50');
    expect(user).toContain('把语气改得更紧迫');
    expect(user).toContain('80 个字符');
    expect(messages[0].content).toContain('80 个字符');
  });
});

describe('buildScorePrompt', () => {
  it('要求 JSON 输出并逐条编号', () => {
    const messages = buildScorePrompt(['文案一', '文案二']);

    expect(messages[0].content).toContain('JSON');
    expect(messages[0].content).toContain('"results"');
    expect(messages[1].content).toContain('[0] 文案一');
    expect(messages[1].content).toContain('[1] 文案二');
    expect(messages[1].content).toContain('2 条文案');
  });
});

describe('parseScoreResult', () => {
  it('解析标准 JSON', () => {
    const result = parseScoreResult(
      '{"results":[{"index":1,"score":88,"reasons":["节奏紧凑","CTA 明确"]},{"index":0,"score":70,"reasons":["略平"]}]}',
    );

    expect(result).toEqual([
      { index: 0, score: 70, reasons: ['略平'] },
      { index: 1, score: 88, reasons: ['节奏紧凑', 'CTA 明确'] },
    ]);
  });

  it('容忍 ```json 围栏与前后废话', () => {
    const fenced = parseScoreResult(
      '好的，结果如下：\n```json\n{"results":[{"index":0,"score":90,"reasons":["好"]}]}\n```\n希望有帮助',
    );
    const plainProse = parseScoreResult('{"results":[{"index":0,"score":90,"reasons":["好"]}]} 以上');

    expect(fenced).toEqual([{ index: 0, score: 90, reasons: ['好'] }]);
    expect(plainProse).toEqual([{ index: 0, score: 90, reasons: ['好'] }]);
  });

  it('直接给出数组也接受', () => {
    expect(parseScoreResult('[{"index":0,"score":60,"reasons":["一般"]}]')).toEqual([
      { index: 0, score: 60, reasons: ['一般'] },
    ]);
  });

  it('分数越界会被夹到 0~100，小数会取整', () => {
    const result = parseScoreResult(
      '{"results":[{"index":0,"score":150,"reasons":["a"]},{"index":1,"score":-20,"reasons":["b"]},{"index":2,"score":87.6,"reasons":["c"]}]}',
    );

    expect(result.map((item) => item.score)).toEqual([100, 0, 88]);
  });

  it('index 缺失时按位置补，reasons 去空、限量、兜底', () => {
    const result = parseScoreResult(
      '{"results":[{"score":80,"reasons":["  a  ","","b","c","d"]},{"score":75}]}',
    );

    expect(result).toEqual([
      { index: 0, score: 80, reasons: ['a', 'b', 'c'] },
      { index: 1, score: 75, reasons: ['（模型未给出理由）'] },
    ]);
  });

  it('结构不对时抛 LlmUpstreamError（50200），不返回脏数据', () => {
    expect(() => parseScoreResult('模型今天不想打分')).toThrow(LlmUpstreamError);
    expect(() => parseScoreResult('{"results":[]}')).toThrow('缺少 results 数组');
    expect(() => parseScoreResult('{"results":"oops"}')).toThrow('缺少 results 数组');
    expect(() => parseScoreResult('{"results":[{"index":0,"reasons":["x"]}]}')).toThrow(
      '缺少 score',
    );
    expect(() => parseScoreResult('{"results":[123]}')).toThrow('格式不正确');
  });

  it('错误码是 50200', () => {
    try {
      parseScoreResult('not json');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmUpstreamError);
      expect((error as LlmUpstreamError).code).toBe(50200);
    }
  });
});
