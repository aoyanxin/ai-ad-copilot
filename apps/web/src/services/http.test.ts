import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError, apiGet, buildQueryString, resolveApiBaseUrl } from './http';

function createJsonResponse(payload: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('buildQueryString', () => {
  it('数组按逗号拼接，空数组与空值不进入 query', () => {
    expect(
      buildQueryString({
        from: '2026-09-07',
        to: '2026-09-20',
        channels: ['douyin', 'baidu'],
        planId: undefined,
        keyword: '',
        statuses: [],
        page: 1,
      }),
    ).toBe('?from=2026-09-07&to=2026-09-20&channels=douyin%2Cbaidu&page=1');
  });

  it('全部为空时返回空字符串', () => {
    expect(buildQueryString({ planId: null, keyword: '   ', statuses: [] })).toBe('');
  });
});

describe('resolveApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认使用共享常量中的 /api 前缀', () => {
    expect(resolveApiBaseUrl()).toBe('/api');
  });

  it('可通过环境变量覆盖并去掉尾部斜杠', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.com/api/');
    expect(resolveApiBaseUrl()).toBe('https://example.com/api');
  });
});

describe('apiGet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('解包 ApiResponse 并返回 data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ code: 0, message: 'ok', data: { total: 3 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/dashboard/records', { page: 1 })).resolves.toEqual({ total: 3 });
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/records?page=1', expect.objectContaining({ method: 'GET' }));
  });

  it('业务码非 0 时抛出 ApiRequestError 并保留错误码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createJsonResponse({ code: 40001, message: '日期区间非法' })),
    );

    await expect(apiGet('/dashboard/overview')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 40001,
      message: '日期区间非法',
    });
  });

  it('HTTP 非 2xx 时抛出后端错误结构', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createJsonResponse({ code: 40401, message: '资源不存在', details: ['planId'] }, { status: 404 }),
      ),
    );

    const error = await apiGet('/dashboard/records').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).details).toEqual(['planId']);
  });

  it('返回非 JSON 时给出可读错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token');
        },
      } as unknown as Response),
    );

    await expect(apiGet('/dashboard/overview')).rejects.toThrow('接口返回了非 JSON 内容（HTTP 200）');
  });

  it('网络异常转换为统一错误码 0，AbortError 原样抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiGet('/dashboard/overview')).rejects.toMatchObject({ code: 0 });

    const abortError = new Error('请求已取消');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    await expect(apiGet('/dashboard/overview')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
