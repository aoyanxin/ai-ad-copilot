import { ErrorCode } from '../../../common/constants/error-code';

/** 对话消息：与 OpenAI / DeepSeek 的 messages 结构一致 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatStreamOptions {
  /** 静默超时：连续这么久没有新 token 就中断 */
  silenceTimeoutMs?: number;
  /** 总时长上限 */
  totalTimeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * LLM 客户端抽象：DeepSeek（真实）与 Mock（离线 / CI）两种实现。
 * 只暴露流式接口 —— 打分这类非流式场景由 service 收集成完整文本后解析，
 * 这样两条链路共用同一套超时与错误处理。
 */
export interface LlmClient {
  readonly model: string;
  chatStream(messages: LlmMessage[], options?: ChatStreamOptions): AsyncIterable<string>;
}

/** LLM 相关错误基类：自带业务错误码，便于 service 直接映射成 HTTP 响应 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** API key 缺失或无效（上游 401） */
export class LlmAuthError extends LlmError {
  constructor(message = 'AI 服务鉴权失败，请检查 LLM_API_KEY 配置') {
    super(message, ErrorCode.UNAUTHORIZED);
  }
}

/** 上游限流（429） */
export class LlmRateLimitError extends LlmError {
  constructor(message = 'AI 服务繁忙（限流），请稍后重试') {
    super(message, ErrorCode.RATE_LIMITED);
  }
}

/** 超时：静默超时或总时长超限 */
export class LlmTimeoutError extends LlmError {
  constructor(message = 'AI 服务响应超时，请重试') {
    super(message, ErrorCode.LLM_TIMEOUT);
  }
}

/** 上游不可用 / 返回内容无法解析 */
export class LlmUpstreamError extends LlmError {
  constructor(message = 'AI 服务暂时不可用，请稍后重试') {
    super(message, ErrorCode.LLM_UPSTREAM);
  }
}

/** 请求被取消（客户端断开或用户主动停止）：不是错误，调用方应该安静收尾 */
export class LlmAbortError extends Error {
  constructor(message = '请求已取消') {
    super(message);
    this.name = 'LlmAbortError';
  }
}

/** 判断是否是"取消"语义：跨 SDK 与自定义 mock 都能识别 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof LlmAbortError) {
    return true;
  }
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'APIUserAbortError' || name === 'LlmAbortError';
}

/**
 * 把 openai SDK 抛出的错误翻译成本模块的错误类型。
 *
 * 刻意按 `status` / `name` 判断而不是 `instanceof`：一是避免与 SDK 大版本耦合，
 * 二是让单测可以用普通对象构造各种上游错误，不必 new 出 SDK 的错误实例。
 */
export function translateLlmError(error: unknown): LlmError | LlmAbortError {
  if (isAbortError(error)) {
    return new LlmAbortError();
  }

  const status = (error as { status?: unknown } | null)?.status;
  const name = (error as { name?: unknown } | null)?.name;

  if (status === 401) {
    return new LlmAuthError();
  }
  if (status === 429) {
    return new LlmRateLimitError();
  }
  if (name === 'APIConnectionTimeoutError' || status === 408 || status === 504) {
    return new LlmTimeoutError();
  }
  if (typeof status === 'number' && status >= 500) {
    return new LlmUpstreamError(`AI 服务返回错误（HTTP ${status}）`);
  }
  if (typeof status === 'number' && status >= 400) {
    return new LlmUpstreamError(`AI 服务拒绝了本次请求（HTTP ${status}）`);
  }
  if (error instanceof Error && error.message) {
    return new LlmUpstreamError(error.message);
  }
  return new LlmUpstreamError();
}
