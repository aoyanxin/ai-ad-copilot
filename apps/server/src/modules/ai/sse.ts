import type { AiStreamEventMap, AiStreamEventName } from '@ai-ad-copilot/shared';
import type { Response } from 'express';

/**
 * SSE 线格式（前后端共用同一份约定）：
 *   event: <name>\n
 *   data: <JSON>\n
 *   \n
 * 用 @Res() 手动写而不是 Nest 的 @Sse()：全局 ResponseInterceptor 会把控制器
 * 返回值包成 {code,message,data}，@Sse() 的 MessageEvent 会被包坏；
 * 手动写还让"原始响应文本"可以直接被测试断言。
 */
export function formatSseFrame<K extends AiStreamEventName>(
  event: K,
  data: AiStreamEventMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 注释帧：SSE 客户端会忽略，用于保活 */
export function formatSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export function initSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // 反向代理（Nginx 等）按需关闭缓冲，避免"一次性吐出全部内容"
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export function writeSseFrame<K extends AiStreamEventName>(
  res: Response,
  event: K,
  data: AiStreamEventMap[K],
): void {
  res.write(formatSseFrame(event, data));
}

export function endSseResponse(res: Response): void {
  res.end();
}

export interface ClientAbortHandle {
  signal: AbortSignal;
  cleanup: () => void;
}

/**
 * 客户端断开 → abort 上游 LLM 请求。
 *
 * 监听 res 的 'close' 而不是 req 的：Node 里 req 的 'close' 可能在请求体读完时
 * 就触发，会误杀正在正常生成的流；用 res 'close' + writableEnded 判断才能区分
 * "客户端提前断开"与"我们正常写完"。
 */
export function createClientAbort(res: Response): ClientAbortHandle {
  const controller = new AbortController();

  const onClose = (): void => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.on('close', onClose);

  return {
    signal: controller.signal,
    cleanup: () => {
      res.off('close', onClose);
    },
  };
}
