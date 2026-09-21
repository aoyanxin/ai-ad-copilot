import { ErrorCode } from '../../../common/constants/error-code';
import {
  isAbortError,
  LlmAbortError,
  LlmAuthError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmUpstreamError,
  translateLlmError,
} from './llm-client';

describe('translateLlmError', () => {
  it('401 映射成鉴权错误（40100）', () => {
    const error = translateLlmError({ status: 401 });

    expect(error).toBeInstanceOf(LlmAuthError);
    expect((error as LlmAuthError).code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('429 映射成限流错误（42900）', () => {
    const error = translateLlmError({ status: 429 });

    expect(error).toBeInstanceOf(LlmRateLimitError);
    expect((error as LlmRateLimitError).code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('连接超时映射成超时错误（50400）', () => {
    const byName = translateLlmError({ name: 'APIConnectionTimeoutError' });
    const byStatus = translateLlmError({ status: 504 });

    expect(byName).toBeInstanceOf(LlmTimeoutError);
    expect(byStatus).toBeInstanceOf(LlmTimeoutError);
    expect((byName as LlmTimeoutError).code).toBe(ErrorCode.LLM_TIMEOUT);
  });

  it('5xx 映射成上游错误（50200）', () => {
    const error = translateLlmError({ status: 503 });

    expect(error).toBeInstanceOf(LlmUpstreamError);
    expect((error as LlmUpstreamError).code).toBe(ErrorCode.LLM_UPSTREAM);
  });

  it('4xx（非 401/429）也归到上游错误', () => {
    expect(translateLlmError({ status: 422 })).toBeInstanceOf(LlmUpstreamError);
  });

  it('普通 Error 与未知值都归到上游错误', () => {
    expect(translateLlmError(new Error('socket hang up'))).toBeInstanceOf(LlmUpstreamError);
    expect(translateLlmError(undefined)).toBeInstanceOf(LlmUpstreamError);
  });

  it('取消语义保持为 LlmAbortError，不会被当成错误上报', () => {
    expect(translateLlmError(new LlmAbortError())).toBeInstanceOf(LlmAbortError);
    expect(translateLlmError({ name: 'AbortError' })).toBeInstanceOf(LlmAbortError);
    expect(translateLlmError({ name: 'APIUserAbortError' })).toBeInstanceOf(LlmAbortError);
  });
});

describe('isAbortError', () => {
  it('识别自定义与跨 SDK 的取消错误', () => {
    expect(isAbortError(new LlmAbortError())).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ name: 'APIUserAbortError' })).toBe(true);
  });

  it('不把其它错误误判成取消', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
