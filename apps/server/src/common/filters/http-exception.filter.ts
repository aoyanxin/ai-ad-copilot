import type { ApiErrorResponse } from '@ai-ad-copilot/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ERROR_MESSAGES, ErrorCode, isErrorCode, toErrorCode } from '../constants/error-code';

/**
 * 全局异常过滤器：把任何异常转成 ApiErrorResponse，保证错误结构统一。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = this.resolveCode(exception, status);

    const body: ApiErrorResponse = {
      code,
      message: this.resolveMessage(exception, code),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    const details = this.resolveDetails(exception);
    if (details.length > 0) {
      body.details = details;
    }

    if (code === ErrorCode.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} 处理失败`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown, code: ErrorCode): string {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return payload;
      }

      if (typeof payload === 'object' && payload !== null) {
        const message = (payload as { message?: unknown }).message;

        if (typeof message === 'string') {
          return message;
        }
      }

      return ERROR_MESSAGES[code];
    }

    return ERROR_MESSAGES[code];
  }

  /**
   * 错误码优先取异常体里显式声明的 code（例如区间校验的 40001），
   * 否则按 HTTP 状态码兜底映射，保持 Day1 的既有语义。
   */
  private resolveCode(exception: unknown, status: number): ErrorCode {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const code = (payload as { code?: unknown }).code;

        if (isErrorCode(code)) {
          return code;
        }
      }
    }

    return toErrorCode(status);
  }

  private resolveDetails(exception: unknown): string[] {
    if (!(exception instanceof HttpException)) {
      return [];
    }

    const payload = exception.getResponse();

    if (typeof payload !== 'object' || payload === null) {
      return [];
    }

    const message = (payload as { message?: unknown }).message;

    return Array.isArray(message) ? message.map((item) => String(item)) : [];
  }
}
