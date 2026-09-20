/**
 * 前后端共享的接口契约类型。
 *
 * 说明：这里的错误码数值语义见 server/src/common/constants/error-code.ts，
 * 数值结构（业务码 5 位：HTTP 状态 * 100 + 业务序号）在两端保持一致。
 */

/** 统一响应包裹结构，所有后端接口均返回该结构 */
export interface ApiResponse<T> {
  /** 业务码，0 表示成功 */
  code: number;
  /** 人类可读提示，成功固定为 ok */
  message: string;
  /** 业务数据 */
  data: T;
  /** 请求追踪 ID，便于排查问题 */
  traceId?: string;
}

/** 错误响应结构（非 2xx 或业务失败时返回） */
export interface ApiErrorResponse {
  code: number;
  message: string;
  /** 校验失败等场景的明细 */
  details?: string[];
  /** 出错请求路径 */
  path?: string;
  /** ISO 时间戳 */
  timestamp?: string;
}

/** 分页请求参数 */
export interface PageQuery {
  page: number;
  pageSize: number;
}

/** 分页响应结构 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
