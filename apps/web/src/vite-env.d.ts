/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** mock | real：看板数据源，默认 mock */
  readonly VITE_API_MODE?: 'mock' | 'real';
  /** 真实接口的 base url，默认走 /api 由 Vite 代理 */
  readonly VITE_API_BASE_URL?: string;
  /** mock 请求模拟耗时（毫秒） */
  readonly VITE_MOCK_DELAY?: string;
  /** 每 N 次请求模拟一次失败，0 表示不模拟 */
  readonly VITE_MOCK_FAILURE_EVERY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
