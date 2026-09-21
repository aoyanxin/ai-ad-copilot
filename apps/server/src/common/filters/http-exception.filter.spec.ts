import { BadRequestException, type ArgumentsHost, NotFoundException } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code';
import { HttpExceptionFilter } from './http-exception.filter';

interface MockResponse {
  status: (code: number) => { json: (body: unknown) => void };
  json: (body: unknown) => void;
}

function createHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response: MockResponse = { status, json };
  const request = { url: '/api/demo', method: 'GET' };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('把 HttpException 转成统一错误结构', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('资源不存在'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.NOT_FOUND,
        message: '资源不存在',
        path: '/api/demo',
      }),
    );
  });

  it('保留校验失败的 details 明细', () => {
    const { host, json } = createHost();

    filter.catch(new BadRequestException(['name 不能为空', 'budget 必须为正数']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.BAD_REQUEST,
        details: ['name 不能为空', 'budget 必须为正数'],
      }),
    );
  });

  it('异常体显式声明的业务码优先于 HTTP 状态码兜底', () => {
    const { host, status, json } = createHost();

    filter.catch(
      new BadRequestException({
        code: ErrorCode.INVALID_QUERY_RANGE,
        message: '查询区间非法',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.INVALID_QUERY_RANGE,
        message: '查询区间非法',
      }),
    );
  });

  it('异常体里的未知 code 不会被采信，回落到状态码映射', () => {
    const { host, json } = createHost();

    filter.catch(new BadRequestException({ code: 999, message: 'weird' }), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.BAD_REQUEST, message: 'weird' }),
    );
  });

  it('非 HttpException 统一按 500 处理', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: '服务内部错误',
      }),
    );
  });
});
