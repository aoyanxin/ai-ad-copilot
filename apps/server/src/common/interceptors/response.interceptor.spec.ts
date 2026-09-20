import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { ErrorCode } from '../constants/error-code';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const next: CallHandler<{ value: number }> = { handle: () => of({ value: 42 }) };

  it('把业务数据包装成统一响应结构', async () => {
    const result = await firstValueFrom(interceptor.intercept({} as ExecutionContext, next));

    expect(result).toEqual({
      code: ErrorCode.SUCCESS,
      message: 'ok',
      data: { value: 42 },
    });
  });
});
