import { HttpStatus } from '@nestjs/common';

import { ERROR_MESSAGES, ErrorCode, isErrorCode, toErrorCode } from './error-code';

describe('ErrorCode', () => {
  it('新增的 LLM 相关码遵循"HTTP 状态码 * 100 + 序号"规则', () => {
    expect(ErrorCode.RATE_LIMITED).toBe(42900);
    expect(ErrorCode.LLM_UPSTREAM).toBe(50200);
    expect(ErrorCode.LLM_TIMEOUT).toBe(50400);
  });

  it('每个错误码都有文案', () => {
    Object.values(ErrorCode)
      .filter((value): value is ErrorCode => typeof value === 'number')
      .forEach((code) => {
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
  });
});

describe('toErrorCode', () => {
  it('已知状态码映射', () => {
    expect(toErrorCode(HttpStatus.BAD_REQUEST)).toBe(ErrorCode.BAD_REQUEST);
    expect(toErrorCode(HttpStatus.UNAUTHORIZED)).toBe(ErrorCode.UNAUTHORIZED);
    expect(toErrorCode(HttpStatus.FORBIDDEN)).toBe(ErrorCode.FORBIDDEN);
    expect(toErrorCode(HttpStatus.NOT_FOUND)).toBe(ErrorCode.NOT_FOUND);
  });

  it('LLM 相关状态码映射', () => {
    expect(toErrorCode(HttpStatus.TOO_MANY_REQUESTS)).toBe(ErrorCode.RATE_LIMITED);
    expect(toErrorCode(HttpStatus.BAD_GATEWAY)).toBe(ErrorCode.LLM_UPSTREAM);
    expect(toErrorCode(HttpStatus.SERVICE_UNAVAILABLE)).toBe(ErrorCode.LLM_UPSTREAM);
    expect(toErrorCode(HttpStatus.GATEWAY_TIMEOUT)).toBe(ErrorCode.LLM_TIMEOUT);
  });

  it('其余 5xx 兜底为内部错误，其余 4xx 兜底为请求参数有误', () => {
    expect(toErrorCode(HttpStatus.INTERNAL_SERVER_ERROR)).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(toErrorCode(599)).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(toErrorCode(HttpStatus.CONFLICT)).toBe(ErrorCode.BAD_REQUEST);
  });
});

describe('isErrorCode', () => {
  it('只认已定义的错误码', () => {
    expect(isErrorCode(ErrorCode.RATE_LIMITED)).toBe(true);
    expect(isErrorCode(ErrorCode.SUCCESS)).toBe(true);
    expect(isErrorCode(49999)).toBe(false);
    expect(isErrorCode('40000')).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});
