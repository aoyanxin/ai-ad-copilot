import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '../services/http';
import { useAsyncResource } from './useAsyncResource';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsyncResource', () => {
  it('加载成功后返回数据并结束 loading', async () => {
    const load = vi.fn().mockResolvedValue({ total: 1 });
    const { result } = renderHook(() => useAsyncResource('key-1', load));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ total: 1 });
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('失败时给出可读错误并保留上一次数据', async () => {
    const deferred = createDeferred<number[]>();
    const load = vi.fn().mockReturnValueOnce(deferred.promise);
    const { result } = renderHook(() => useAsyncResource('key-2', load));

    await act(async () => {
      deferred.resolve([1, 2]);
    });
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));

    load.mockRejectedValueOnce(new ApiRequestError(50001, '后端开小差了'));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('后端开小差了'));
    expect(result.current.data).toEqual([1, 2]);
    expect(result.current.loading).toBe(false);
  });

  it('key 变化时重新请求，且不会用旧响应覆盖新数据', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const load = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result, rerender } = renderHook(({ resourceKey }) => useAsyncResource(resourceKey, load), {
      initialProps: { resourceKey: 'a' },
    });

    rerender({ resourceKey: 'b' });

    await act(async () => {
      second.resolve('B');
    });
    await waitFor(() => expect(result.current.data).toBe('B'));

    // 旧请求晚到也不能覆盖新结果
    await act(async () => {
      first.resolve('A');
    });
    expect(result.current.data).toBe('B');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refresh 会重新触发请求', async () => {
    const load = vi.fn().mockResolvedValue('value');
    const { result } = renderHook(() => useAsyncResource('key-3', load));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refresh());

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('请求被 abort 时不写入错误态', async () => {
    const load = vi.fn().mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('请求已取消');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    const { result, unmount } = renderHook(() => useAsyncResource('key-4', load));
    unmount();

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
  });
});
