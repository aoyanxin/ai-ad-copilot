/**
 * AI 文案助手的跨端契约：请求结构、流式事件与打分结果。
 *
 * SSE 线格式（server 写、web 读）固定为 `event: <name>\ndata: <JSON>\n\n`，
 * 事件名与 payload 结构都收敛在这里 —— mock 实现与 DeepSeek 实现必须产出
 * 同一套序列，否则会出现"mock 好的、real 挂着"。
 */

import type { AdChannel } from './dashboard';

/** 文案语气 */
export const COPYWRITING_TONES = ['professional', 'casual', 'urgent'] as const;

export type CopywritingTone = (typeof COPYWRITING_TONES)[number];

/** 一次生成返回的版本数：固定 3，等于并发上游请求数（成本上限） */
export const COPYWRITING_MAX_VARIANTS = 3;

/**
 * 版本角度：用"角度"而不是随机采样来区分多个版本，
 * 保证 3 版内容真的不同，同时让 prompt 与断言都可预测。
 */
export const COPYWRITING_VARIANT_ANGLES = ['selling_point', 'scenario', 'benefit'] as const;

export type CopywritingVariantAngle = (typeof COPYWRITING_VARIANT_ANGLES)[number];

/** 流式事件名（顺序即服务端发送顺序） */
export const AI_STREAM_EVENTS = [
  'meta',
  'variant',
  'delta',
  'variant-done',
  'done',
  'error',
] as const;

export type AiStreamEventName = (typeof AI_STREAM_EVENTS)[number];

export interface AiStreamMetaPayload {
  model: string;
  variantCount: number;
  requestId: string;
}

export interface AiStreamVariantPayload {
  index: number;
  angle: CopywritingVariantAngle;
}

export interface AiStreamDeltaPayload {
  index: number;
  text: string;
}

export interface AiStreamVariantDonePayload {
  index: number;
  finishReason: string;
  chars: number;
}

export interface AiStreamDonePayload {
  durationMs: number;
  variantCount: number;
}

/** 流内错误：连接已建立之后的失败只能这样表达（HTTP 状态码已经发出去了） */
export interface AiStreamErrorPayload {
  code: number;
  message: string;
  details?: string[];
  /** 出错时正在生成的版本（整体失败时为 undefined） */
  index?: number;
}

export interface AiStreamEventMap {
  meta: AiStreamMetaPayload;
  variant: AiStreamVariantPayload;
  delta: AiStreamDeltaPayload;
  'variant-done': AiStreamVariantDonePayload;
  done: AiStreamDonePayload;
  error: AiStreamErrorPayload;
}

/** 判别联合：`event` 决定 `data` 的具体结构 */
export type AiStreamEvent = {
  [K in AiStreamEventName]: { event: K; data: AiStreamEventMap[K] };
}[AiStreamEventName];

/** 单条文案的打分结果 */
export interface ScoreResult {
  /** 对应请求里 copies 的下标 */
  index: number;
  /** 0~100 整数 */
  score: number;
  reasons: string[];
}

/** POST /api/ai/copywriting/stream */
export interface CopywritingRequest {
  product: string;
  audience: string;
  channel?: AdChannel;
  tone: CopywritingTone;
  /** 固定为 COPYWRITING_MAX_VARIANTS，显式传便于契约自解释 */
  variants: number;
}

/** POST /api/ai/copywriting/rewrite/stream */
export interface RewriteRequest {
  original: string;
  instruction: string;
}

/** POST /api/ai/copywriting/score */
export interface ScoreRequest {
  copies: string[];
}

export function isCopywritingTone(value: unknown): value is CopywritingTone {
  return typeof value === 'string' && (COPYWRITING_TONES as readonly string[]).includes(value);
}

export function isCopywritingVariantAngle(value: unknown): value is CopywritingVariantAngle {
  return (
    typeof value === 'string' && (COPYWRITING_VARIANT_ANGLES as readonly string[]).includes(value)
  );
}

export function isAiStreamEventName(value: unknown): value is AiStreamEventName {
  return typeof value === 'string' && (AI_STREAM_EVENTS as readonly string[]).includes(value);
}
