import {
  COPYWRITING_VARIANT_ANGLES,
  type AdChannel,
  type CopywritingTone,
  type CopywritingVariantAngle,
  type ScoreResult,
} from '@ai-ad-copilot/shared';

import { LlmUpstreamError, type LlmMessage } from './llm/llm-client';

/** 单条文案默认字数上限：写进 prompt 的硬约束，控制 token 成本 */
export const DEFAULT_MAX_COPY_CHARS = 120;

/** 打分结果的分数区间 */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

const TONE_LABELS: Record<CopywritingTone, string> = {
  professional: '专业可信',
  casual: '轻松口语化',
  urgent: '紧迫促单',
};

/** 每个版本对应一个明确角度，避免 3 个版本互相重复 */
const ANGLE_HINTS: Record<CopywritingVariantAngle, string> = {
  selling_point: '开门见山讲清核心卖点，突出产品差异',
  scenario: '用目标人群的具体使用场景切入，先共情再带出产品',
  benefit: '强调限时优惠、赠品或立减等立即行动的理由',
};

const CHANNEL_LABELS: Record<AdChannel, string> = {
  douyin: '抖音信息流',
  kuaishou: '快手信息流',
  tencent: '腾讯广告',
  baidu: '百度搜索/信息流',
  xiaohongshu: '小红书',
};

export function resolveMaxCopyChars(raw: string | number | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_COPY_CHARS;
}

/** 三个模板共用的 system 约束 */
export function buildCopywritingRules(maxChars: number = DEFAULT_MAX_COPY_CHARS): string {
  return [
    '你是资深的效果广告文案专家，服务于中国市场的信息流广告投放。',
    '必须遵守：',
    '1. 只输出文案正文，不要解释、不要 Markdown 标记、不要用引号包裹；',
    `2. 单条文案不超过 ${maxChars} 个字符，必须包含一个明确的行动号召（CTA）；`,
    '3. 不得编造价格、销量、认证、功效等无法核实的信息；',
    '4. 不得使用"最""第一""国家级""100%"等绝对化用语。',
  ].join('\n');
}

export interface CopywritingPromptInput {
  product: string;
  audience: string;
  channel?: AdChannel;
  tone: CopywritingTone;
  angle: CopywritingVariantAngle;
  maxChars?: number;
}

/** 生成单条文案的 prompt（一个角度一条，多版本由 service 并发调用） */
export function buildCopywritingPrompt(input: CopywritingPromptInput): LlmMessage[] {
  const maxChars = input.maxChars ?? DEFAULT_MAX_COPY_CHARS;
  const channelLine = input.channel ? `投放渠道：${CHANNEL_LABELS[input.channel]}\n` : '';

  return [
    { role: 'system', content: buildCopywritingRules(maxChars) },
    {
      role: 'user',
      content: [
        '请为下面的投放场景写一条广告文案。',
        `写作角度：${ANGLE_HINTS[input.angle]}`,
        `产品：${input.product}`,
        `目标人群：${input.audience}`,
        channelLine + `语气：${TONE_LABELS[input.tone]}`,
        `再次确认：不超过 ${maxChars} 个字符，结尾必须给出行动号召。`,
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    },
  ];
}

/** 改写：保留原有信息点，按指令调整，同样受字数上限约束 */
export function buildRewritePrompt(
  original: string,
  instruction: string,
  maxChars: number = DEFAULT_MAX_COPY_CHARS,
): LlmMessage[] {
  return [
    { role: 'system', content: buildCopywritingRules(maxChars) },
    {
      role: 'user',
      content: [
        '请按下面的要求改写这条广告文案，只输出改写后的正文，不要解释。',
        `原文案：${original}`,
        `改写要求：${instruction}`,
        `约束：保持原有信息点，不超过 ${maxChars} 个字符，必须保留行动号召。`,
      ].join('\n'),
    },
  ];
}

/** 打分：要求模型只输出 JSON，结构由 parseScoreResult 校验 */
export function buildScorePrompt(copies: string[]): LlmMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是广告文案评审，请只输出 JSON，不要输出任何解释或 Markdown 代码块。',
        'JSON 结构：{"results":[{"index":0,"score":0,"reasons":["理由1","理由2"]}]}',
        `score 为 ${SCORE_MIN}~${SCORE_MAX} 的整数；reasons 给 2-3 条，每条不超过 40 字。`,
        '评分维度：吸引力、表达清晰度、行动引导、合规性。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `请给下面 ${copies.length} 条文案打分，index 与给定编号一一对应：`,
        ...copies.map((copy, index) => `[${index}] ${copy}`),
      ].join('\n'),
    },
  ];
}

/** 从模型输出里抠出 JSON：容忍 ```json 围栏与前后废话 */
function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const attempts = [candidate];
  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');
  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');

  if (objectStart >= 0 && objectEnd > objectStart) {
    attempts.push(candidate.slice(objectStart, objectEnd + 1));
  }
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    attempts.push(candidate.slice(arrayStart, arrayEnd + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // 换下一种切法
    }
  }

  throw new LlmUpstreamError('AI 返回的打分结果不是合法 JSON');
}

function toScoreResult(item: unknown, position: number): ScoreResult {
  if (typeof item !== 'object' || item === null) {
    throw new LlmUpstreamError('AI 返回的打分结果格式不正确');
  }

  const record = item as { index?: unknown; score?: unknown; reasons?: unknown };
  const score = Number(record.score);

  if (!Number.isFinite(score)) {
    throw new LlmUpstreamError('AI 返回的打分缺少 score');
  }

  const reasons = Array.isArray(record.reasons)
    ? record.reasons
        .filter((reason): reason is string => typeof reason === 'string')
        .map((reason) => reason.trim())
        .filter((reason) => reason.length > 0)
        .slice(0, 3)
    : [];

  return {
    index: Number.isInteger(record.index) ? (record.index as number) : position,
    score: Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score))),
    reasons: reasons.length > 0 ? reasons : ['（模型未给出理由）'],
  };
}

/**
 * 解析打分结果：容错但不放水 —— 结构不对就抛 LlmUpstreamError（50200），
 * 绝不把模型的原始输出直接当结构化数据渲染。
 */
export function parseScoreResult(raw: string): ScoreResult[] {
  const payload = extractJsonPayload(raw);
  const list = Array.isArray(payload)
    ? payload
    : ((payload as { results?: unknown }).results as unknown);

  if (!Array.isArray(list) || list.length === 0) {
    throw new LlmUpstreamError('AI 返回的打分结果结构不正确（缺少 results 数组）');
  }

  return list.map((item, position) => toScoreResult(item, position)).sort((a, b) => a.index - b.index);
}

/** 版本角度的稳定顺序：与 COPYWRITING_MAX_VARIANTS 对齐 */
export const COPYWRITING_ANGLES_IN_ORDER: readonly CopywritingVariantAngle[] =
  COPYWRITING_VARIANT_ANGLES;
