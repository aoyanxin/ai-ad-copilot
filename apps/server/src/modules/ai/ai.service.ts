import type {
  CopywritingRequest,
  CopywritingVariantAngle,
  RewriteRequest,
  ScoreResult,
} from '@ai-ad-copilot/shared';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '../../common/constants/error-code';
import { LLM_CLIENT } from './llm/llm-client.factory';
import { isAbortError, LlmError, type LlmClient, type LlmMessage } from './llm/llm-client';
import { resolveTimeoutMs, withStreamTimeouts } from './llm/stream-timeouts';
import {
  buildCopywritingPrompt,
  buildRewritePrompt,
  buildScorePrompt,
  parseScoreResult,
  resolveMaxCopyChars,
} from './prompt-templates';

/** 静默超时默认 30s：连续 30s 没有新 token 判超时 */
export const DEFAULT_SILENCE_TIMEOUT_MS = 30_000;

/** 总时长上限默认 120s：长文案不会被 30s 砍断，但整体有界 */
export const DEFAULT_TOTAL_TIMEOUT_MS = 120_000;

/** 日志里 prompt / 输出最多保留的字符数 */
export const LOG_VALUE_MAX_LENGTH = 200;

/** 日志脱敏：折叠空白并截断，避免把完整用户输入与模型输出打出去 */
export function truncateForLog(value: string, max: number = LOG_VALUE_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
      return HttpStatus.UNAUTHORIZED;
    case ErrorCode.RATE_LIMITED:
      return HttpStatus.TOO_MANY_REQUESTS;
    case ErrorCode.LLM_TIMEOUT:
      return HttpStatus.GATEWAY_TIMEOUT;
    case ErrorCode.LLM_UPSTREAM:
      return HttpStatus.BAD_GATEWAY;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/**
 * 把 LLM 错误映射成 HTTP 异常：错误码沿用 Day3 的"异常体显式 code"约定，
 * 由 HttpExceptionFilter 原样输出。
 *
 * 返回 null 表示这是"取消"而不是错误（客户端断开 / 用户点停止），调用方安静收尾即可。
 */
export function toHttpException(error: unknown): HttpException | null {
  if (isAbortError(error)) {
    return null;
  }

  if (error instanceof LlmError) {
    return new HttpException(
      { code: error.code, message: error.message },
      httpStatusFor(error.code),
    );
  }

  return new HttpException(
    { code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'AI 服务异常，请稍后重试' },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly silenceTimeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxChars: number;

  constructor(
    @Inject(LLM_CLIENT) private readonly client: LlmClient,
    configService: ConfigService,
  ) {
    this.silenceTimeoutMs = resolveTimeoutMs(
      configService.get<string>('LLM_TIMEOUT_MS'),
      DEFAULT_SILENCE_TIMEOUT_MS,
    );
    this.totalTimeoutMs = resolveTimeoutMs(
      configService.get<string>('LLM_TOTAL_TIMEOUT_MS'),
      DEFAULT_TOTAL_TIMEOUT_MS,
    );
    this.maxChars = resolveMaxCopyChars(configService.get<string>('LLM_MAX_COPY_CHARS'));
  }

  get model(): string {
    return this.client.model;
  }

  /** 单个版本的文案流；多版本由 controller 按角度并发调用后按 index 分流 */
  generateCopywriting(
    request: CopywritingRequest,
    angle: CopywritingVariantAngle,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const messages = buildCopywritingPrompt({
      product: request.product,
      audience: request.audience,
      channel: request.channel,
      tone: request.tone,
      angle,
      maxChars: this.maxChars,
    });

    return this.stream(messages, `copywriting/${angle}`, signal);
  }

  rewriteCopywriting(request: RewriteRequest, signal?: AbortSignal): AsyncIterable<string> {
    const messages = buildRewritePrompt(request.original, request.instruction, this.maxChars);
    return this.stream(messages, 'rewrite', signal);
  }

  /** 打分：把流收集成完整文本再解析（对前端是非流式，但复用同一套超时与错误处理） */
  async scoreCopywriting(copies: string[], signal?: AbortSignal): Promise<ScoreResult[]> {
    const messages = buildScorePrompt(copies);
    let raw = '';

    for await (const chunk of this.stream(messages, 'score', signal)) {
      raw += chunk;
    }

    return parseScoreResult(raw);
  }

  /** 统一出口：外部取消 → 内部 controller → 上游 client */
  private stream(
    messages: LlmMessage[],
    label: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort();

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', forwardAbort, { once: true });
    }

    this.logger.debug(
      `LLM ${label} 请求：model=${this.model} prompt="${truncateForLog(
        messages.at(-1)?.content ?? '',
      )}"`,
    );

    const guarded = withStreamTimeouts(
      this.client.chatStream(messages, { signal: controller.signal }),
      {
        silenceTimeoutMs: this.silenceTimeoutMs,
        totalTimeoutMs: this.totalTimeoutMs,
        signal,
        abortUpstream: forwardAbort,
      },
    );

    return this.trackOutput(guarded, label, () =>
      signal?.removeEventListener('abort', forwardAbort),
    );
  }

  private async *trackOutput(
    source: AsyncIterable<string>,
    label: string,
    cleanup: () => void,
  ): AsyncIterable<string> {
    const collected: string[] = [];

    try {
      for await (const chunk of source) {
        collected.push(chunk);
        yield chunk;
      }

      this.logger.debug(`LLM ${label} 输出：${truncateForLog(collected.join(''))}`);
    } finally {
      cleanup();
    }
  }
}
