import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage, isAbortError } from '../services/http';

export interface AsyncResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * 统一的异步数据状态机：loading / error / empty 由调用方按 data 是否为空判断。
 * - key 变化才重新请求，避免依赖数组里放对象导致的重复请求
 * - 组件卸载或 key 变化时 abort 上一个请求，防止竞态覆盖新数据
 */
export function useAsyncResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): AsyncResourceState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);

  // 先同步最新的 loader（每次渲染都会带新的闭包），再触发请求
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState((previous) => ({ ...previous, loading: true, error: null }));

    loadRef
      .current(controller.signal)
      .then((data) => {
        if (active) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }
        setState((previous) => ({
          data: previous.data,
          loading: false,
          error: getErrorMessage(error),
        }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
}
