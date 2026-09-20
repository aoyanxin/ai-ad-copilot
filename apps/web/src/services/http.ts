/**
 * 极简 HTTP 客户端：统一拼 /api 前缀、解包 ApiResponse、把错误收敛成 ApiRequestError。
 * 不引入额外依赖，真实接口切换时只需替换 services/dashboard.ts 里的实现。
 */

import { API_PREFIX, type ApiErrorResponse, type ApiResponse } from '@ai-ad-copilot/shared';

import type { RequestOptions } from './types';

export class ApiRequestError extends Error {
  readonly code: number;
  readonly details: string[] | undefined;

  constructor(code: number, message: string, details?: string[]) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.details = details;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '请求失败，请稍后重试';
}

export type QueryParamValue = string | number | boolean | readonly string[] | null | undefined;

/** 数组参数按逗号拼接，空值不进入 query，避免后端收到 channel= 这类脏参数 */
export function buildQueryString(params: Record<string, QueryParamValue>): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'string' && value.trim() === '') {
        return;
      }
      search.set(key, String(value));
      return;
    }

    if (value.length > 0) {
      search.set(key, value.join(','));
    }
  });

  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}

export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : API_PREFIX;
}

export async function apiGet<T>(
  path: string,
  params: Record<string, QueryParamValue> = {},
  options: RequestOptions = {},
): Promise<T> {
  const url = `${resolveApiBaseUrl()}${path}${buildQueryString(params)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiRequestError(0, '网络异常，请确认后端服务已启动');
  }

  let payload: ApiResponse<T> | ApiErrorResponse;
  try {
    payload = (await response.json()) as ApiResponse<T> | ApiErrorResponse;
  } catch {
    throw new ApiRequestError(response.status, `接口返回了非 JSON 内容（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const failure = payload as Partial<ApiErrorResponse>;
    throw new ApiRequestError(
      typeof failure.code === 'number' ? failure.code : response.status,
      failure.message || `请求失败（HTTP ${response.status}）`,
      failure.details,
    );
  }

  if (payload.code !== 0) {
    const failure = payload as Partial<ApiErrorResponse>;
    throw new ApiRequestError(payload.code, failure.message || '请求失败', failure.details);
  }

  return (payload as ApiResponse<T>).data;
}
