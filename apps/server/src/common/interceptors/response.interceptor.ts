import type { ApiResponse } from '@ai-ad-copilot/shared';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import { ERROR_MESSAGES, ErrorCode } from '../constants/error-code';

/**
 * 统一成功响应包装：控制器直接返回业务数据，由拦截器包成 ApiResponse。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.SUCCESS,
        message: ERROR_MESSAGES[ErrorCode.SUCCESS],
        data,
      })),
    );
  }
}
