import {
  COPYWRITING_MAX_VARIANTS,
  COPYWRITING_VARIANT_ANGLES,
  type AiStreamEvent,
  type CopywritingRequest,
  type CopywritingVariantAngle,
  type RewriteRequest,
  type ScoreResult,
} from '@ai-ad-copilot/shared';

import { apiPost, ApiRequestError } from './http';
import { parseSseEvent, postSseStream } from './sse';
import type { RequestOptions } from './types';

export interface AiStreamHandlers {
  signal?: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
}

/**
 * AI 服务契约：mock 与 HTTP 两种实现必须产出同一套事件序列
 * （meta → variant* → delta* → variant-done* → done，出错以 error 收尾）。
 */
export interface AiService {
  streamCopywriting(request: CopywritingRequest, handlers: AiStreamHandlers): Promise<void>;
  streamRewrite(request: RewriteRequest, handlers: AiStreamHandlers): Promise<void>;
  scoreCopywriting(copies: string[], options?: RequestOptions): Promise<ScoreResult[]>;
}

export const httpAiService: AiService = {
  streamCopywriting(request, handlers) {
    return postSseStream('/ai/copywriting/stream', request, {
      signal: handlers.signal,
      onFrame: (frame) => {
        const event = parseSseEvent(frame);
        if (event) {
          handlers.onEvent(event);
        }
      },
    });
  },

  streamRewrite(request, handlers) {
    return postSseStream('/ai/copywriting/rewrite/stream', request, {
      signal: handlers.signal,
      onFrame: (frame) => {
        const event = parseSseEvent(frame);
        if (event) {
          handlers.onEvent(event);
        }
      },
    });
  },

  scoreCopywriting(copies, options) {
    return apiPost<ScoreResult[]>('/ai/copywriting/score', { copies }, options);
  },
};

export type MockAiFailure = 'auth' | 'rate_limit' | 'timeout' | 'upstream';

export interface MockAiServiceOptions {
  /** 每个分片之间的间隔（毫秒），0 表示尽快吐完（测试用） */
  chunkDelayMs?: number;
  /** 强制失败，用于联调错误态 */
  failWith?: MockAiFailure;
}

const MOCK_FAILURES: Record<MockAiFailure, { code: number; message: string }> = {
  auth: { code: 40100, message: 'AI 服务鉴权失败，请检查 LLM_API_KEY 配置' },
  rate_limit: { code: 42900, message: 'AI 服务繁忙（限流），请稍后重试' },
  timeout: { code: 50400, message: 'AI 服务响应超时，请重试' },
  upstream: { code: 50200, message: 'AI 服务暂时不可用，请稍后重试' },
};

const ANGLE_BODY: Record<CopywritingVariantAngle, string> = {
  selling_point: '轻薄防风面料，通勤一整天也不闷',
  scenario: '早高峰地铁里，一件就够体面',
  benefit: '本周下单立减 50 元，晒单再送收纳袋',
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildMockCopy(request: CopywritingRequest, angle: CopywritingVariantAngle): string {
  const digest = hashString(
    `${request.product}|${request.audience}|${request.channel ?? ''}|${request.tone}|${angle}`,
  )
    .toString(16)
    .slice(0, 6);
  const audience = request.audience;

  return `${request.product}｜${ANGLE_BODY[angle]}，${audience}都在穿。立即点击了解详情（mock-${digest}）`;
}

function splitTokens(text: string): string[] {
  return text.match(/.{1,6}/gu) ?? [text];
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return signal?.aborted ? Promise.reject(createAbortError()) : Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(createAbortError());
    }

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}

/**
 * 离线实现：逐词吐字，事件序列与真实后端**完全一致**
 * （同样先发 meta 与全部 variant，再交错 delta，最后 variant-done 与 done）。
 */
export function createMockAiService(options: MockAiServiceOptions = {}): AiService {
  const delayMs = options.chunkDelayMs ?? 40;

  async function streamCopywriting(
    request: CopywritingRequest,
    handlers: AiStreamHandlers,
  ): Promise<void> {
    const variantCount = Math.min(
      request.variants ?? COPYWRITING_MAX_VARIANTS,
      COPYWRITING_MAX_VARIANTS,
    );
    const angles = COPYWRITING_VARIANT_ANGLES.slice(0, variantCount);

    handlers.onEvent({
      event: 'meta',
      data: { model: 'mock-llm', variantCount, requestId: `mock-${Date.now()}` },
    });
    angles.forEach((angle, index) => handlers.onEvent({ event: 'variant', data: { index, angle } }));

    if (options.failWith) {
      // 与真实后端一致：失败也走 error 帧，而不是 reject
      handlers.onEvent({ event: 'error', data: MOCK_FAILURES[options.failWith] });
      return;
    }

    const tokenized = angles.map((angle) => splitTokens(buildMockCopy(request, angle)));
    const maxTokens = Math.max(...tokenized.map((tokens) => tokens.length));

    for (let tokenIndex = 0; tokenIndex < maxTokens; tokenIndex += 1) {
      for (let index = 0; index < tokenized.length; index += 1) {
        const token = tokenized[index][tokenIndex];

        if (!token) {
          continue;
        }

        await wait(delayMs, handlers.signal);
        handlers.onEvent({ event: 'delta', data: { index, text: token } });
      }
    }

    angles.forEach((_, index) =>
      handlers.onEvent({
        event: 'variant-done',
        data: { index, finishReason: 'stop', chars: tokenized[index].join('').length },
      }),
    );
    handlers.onEvent({
      event: 'done',
      data: { durationMs: 0, variantCount },
    });
  }

  async function streamRewrite(
    request: RewriteRequest,
    handlers: AiStreamHandlers,
  ): Promise<void> {
    handlers.onEvent({
      event: 'meta',
      data: { model: 'mock-llm', variantCount: 1, requestId: `mock-${Date.now()}` },
    });

    if (options.failWith) {
      handlers.onEvent({ event: 'error', data: MOCK_FAILURES[options.failWith] });
      return;
    }

    const rewritten = `【已按「${request.instruction}」改写】${request.original}`;

    for (const token of splitTokens(rewritten)) {
      await wait(delayMs, handlers.signal);
      handlers.onEvent({ event: 'delta', data: { index: 0, text: token } });
    }

    handlers.onEvent({
      event: 'variant-done',
      data: { index: 0, finishReason: 'stop', chars: rewritten.length },
    });
    handlers.onEvent({ event: 'done', data: { durationMs: 0, variantCount: 1 } });
  }

  return {
    streamCopywriting,
    streamRewrite,
    async scoreCopywriting(copies) {
      await wait(delayMs, undefined);

      if (options.failWith) {
        const failure = MOCK_FAILURES[options.failWith];
        throw new ApiRequestError(failure.code, failure.message);
      }

      return copies.map((copy, index) => {
        const score = 60 + (hashString(copy) % 35);
        return {
          index,
          score,
          reasons: [`第 ${index + 1} 条结构完整度 ${score} 分`, 'mock 评审结果，仅用于联调'],
        };
      });
    },
  };
}

export const mockAiService: AiService = createMockAiService();

/** 与 dashboard 一致：VITE_API_MODE=real 走真实接口，否则用内存 mock */
export function getAiService(): AiService {
  return import.meta.env.VITE_API_MODE === 'real' ? httpAiService : mockAiService;
}
