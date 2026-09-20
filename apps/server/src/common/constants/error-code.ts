import { HttpStatus } from '@nestjs/common';

/**
 * 业务错误码：5 位数字，规则为 HTTP 状态码 * 100 + 业务序号。
 * 前端拿到的 code 与 HTTP 状态码语义一致，便于统一提示文案。
 */
export enum ErrorCode {
  SUCCESS = 0,
  BAD_REQUEST = 40000,
  UNAUTHORIZED = 40100,
  FORBIDDEN = 40300,
  NOT_FOUND = 40400,
  INTERNAL_SERVER_ERROR = 50000,
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.SUCCESS]: 'ok',
  [ErrorCode.BAD_REQUEST]: '请求参数有误',
  [ErrorCode.UNAUTHORIZED]: '未认证或登录已过期',
  [ErrorCode.FORBIDDEN]: '没有访问权限',
  [ErrorCode.NOT_FOUND]: '请求的资源不存在',
  [ErrorCode.INTERNAL_SERVER_ERROR]: '服务内部错误',
};

/** HTTP 状态码 → 业务错误码 */
export function toErrorCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.BAD_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    default:
      return status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? ErrorCode.INTERNAL_SERVER_ERROR
        : ErrorCode.BAD_REQUEST;
  }
}
