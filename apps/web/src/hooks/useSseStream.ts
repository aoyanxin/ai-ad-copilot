import type { AiStreamEvent, CopywritingRequest, RewriteRequest } from '@ai-ad-copilot/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getAiService, type AiService } from '../services/ai';
import { getErrorMessage, isAbortError } from '../services/http';
import {
  beginStream,
  failStream,
  reduceAiStreamEvent,
  stopStream,
  INITIAL_AI_STREAM_STATE,
  type AiStreamState,
} from '../pages/AiCopilot/utils/stream';

export interface UseSseStreamResult extends AiStreamState {
  startCopywriting: (request: CopywritingRequest) => void;
  /** 改写结果写入指定卡片 */
  startRewrite: (request: RewriteRequest, index: number) => void;
  stop: () => void;
  reset: () => void;
}

/** 改写流没有版本概念，把它的 index 归一到目标卡片 */
function normalizeRewriteEvent(event: AiStreamEvent, index: number): AiStreamEvent {
  switch (event.event) {
    case 'delta':
      return { event: 'delta', data: { index, text: event.data.text } };
    case 'variant-done':
      return {
        event: 'variant-done',
        data: { index, finishReason: event.data.finishReason, chars: event.data.chars },
      };
    default:
      return event;
  }
}

/**
 * SSE 流式状态机：负责 start / stop / 增量累积 / 错误收敛。
 *
 * 主动停止与网络中断要区分：前者进 done（保留已生成文本），后者进 error。
 */
export function useSseStream(service: AiService = getAiService()): UseSseStreamResult {
  const [state, setState] = useState<AiStreamState>(INITIAL_AI_STREAM_STATE);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    (
      targetIndex: number | undefined,
      execute: (
        signal: AbortSignal,
        onEvent: (event: AiStreamEvent) => void,
      ) => Promise<void>,
    ): void => {
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;

      setState((previous) => beginStream(previous, targetIndex));

      const onEvent = (event: AiStreamEvent): void => {
        setState((previous) =>
          reduceAiStreamEvent(
            previous,
            targetIndex === undefined ? event : normalizeRewriteEvent(event, targetIndex),
            { keepVariants: targetIndex !== undefined },
          ),
        );
      };

      execute(controller.signal, onEvent)
        .then(() => {
          if (!mountedRef.current || controller.signal.aborted) {
            return;
          }
          setState((previous) =>
            previous.status === 'streaming' ? { ...previous, status: 'done' } : previous,
          );
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || isAbortError(error)) {
            return;
          }
          setState((previous) => failStream(previous, getErrorMessage(error)));
        });
    },
    [],
  );

  const startCopywriting = useCallback(
    (request: CopywritingRequest): void => {
      run(undefined, (signal, onEvent) =>
        service.streamCopywriting(request, { signal, onEvent }),
      );
    },
    [run, service],
  );

  const startRewrite = useCallback(
    (request: RewriteRequest, index: number): void => {
      run(index, (signal, onEvent) => service.streamRewrite(request, { signal, onEvent }));
    },
    [run, service],
  );

  const stop = useCallback((): void => {
    controllerRef.current?.abort();
    setState((previous) => stopStream(previous));
  }, []);

  const reset = useCallback((): void => {
    controllerRef.current?.abort();
    setState(INITIAL_AI_STREAM_STATE);
  }, []);

  return { ...state, startCopywriting, startRewrite, stop, reset };
}
