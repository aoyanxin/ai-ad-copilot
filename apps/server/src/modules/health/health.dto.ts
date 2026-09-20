/**
 * 健康检查响应 DTO。
 *
 * Day1 只有探活接口，所以用 interface 描述响应契约；
 * Day2+ 出现真实业务入参时再引入 class-validator 的请求 DTO。
 */
export interface HealthStatusDto {
  status: 'ok';
  /** 进程已运行秒数 */
  uptime: number;
  version: string;
  timestamp: string;
}
