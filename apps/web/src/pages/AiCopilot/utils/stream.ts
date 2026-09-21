import type { AiStreamEvent, CopywritingVariantAngle } from '@ai-ad-copilot/shared';

export interface AiStreamState {
  status: 'idle' | 'streaming' | 'done' | 'error';
  /** 版本数量（meta 帧给出） */
  variantCount: number;
  /** 按 index 累积的文本 */
  variants: string[];
  angles: (CopywritingVariantAngle | null)[];
  finished: boolean[];
  model: string | null;
  durationMs: number | null;
  error: string | null;
  /** 是否由用户主动停止 */
  stopped: boolean;
}

export const INITIAL_AI_STREAM_STATE: AiStreamState = {
  status: 'idle',
  variantCount: 0,
  variants: [],
  angles: [],
  finished: [],
  model: null,
  durationMs: null,
  error: null,
  stopped: false,
};

function resize<T>(list: T[], length: number, filler: T): T[] {
  return Array.from({ length }, (_, index) => list[index] ?? filler);
}

function setAt<T>(list: T[], index: number, value: T): T[] {
  if (index < 0) {
    return list;
  }
  return Array.from({ length: Math.max(list.length, index + 1) }, (_, position) =>
    position === index ? value : (list[position] ?? value),
  );
}

export function appendToIndex(list: string[], index: number, text: string): string[] {
  if (index < 0 || text.length === 0) {
    return list;
  }

  const next = [...list];
  while (next.length <= index) {
    next.push('');
  }
  next[index] = `${next[index]}${text}`;
  return next;
}

/**
 * 纯函数 reducer：把 SSE 事件折叠成 UI 状态。
 * keepVariants 用于改写（改写流没有"多版本"语义，不能重置其它卡片）。
 */
export function reduceAiStreamEvent(
  state: AiStreamState,
  event: AiStreamEvent,
  options: { keepVariants?: boolean } = {},
): AiStreamState {
  switch (event.event) {
    case 'meta':
      return options.keepVariants
        ? { ...state, model: event.data.model }
        : {
            ...state,
            model: event.data.model,
            variantCount: event.data.variantCount,
            variants: resize(state.variants, event.data.variantCount, ''),
            angles: resize(state.angles, event.data.variantCount, null),
            finished: resize(state.finished, event.data.variantCount, false),
          };

    case 'variant':
      return { ...state, angles: setAt(state.angles, event.data.index, event.data.angle) };

    case 'delta':
      return { ...state, variants: appendToIndex(state.variants, event.data.index, event.data.text) };

    case 'variant-done':
      return { ...state, finished: setAt(state.finished, event.data.index, true) };

    case 'done':
      return { ...state, status: 'done', durationMs: event.data.durationMs };

    case 'error':
      return { ...state, status: 'error', error: event.data.message };

    default:
      return state;
  }
}

/** 开始新一轮生成：文案生成要清空旧结果，改写只清目标卡片 */
export function beginStream(state: AiStreamState, targetIndex?: number): AiStreamState {
  if (targetIndex === undefined) {
    return { ...INITIAL_AI_STREAM_STATE, status: 'streaming' };
  }

  return {
    ...state,
    status: 'streaming',
    error: null,
    stopped: false,
    variants: setAt(state.variants, targetIndex, ''),
  };
}

export function stopStream(state: AiStreamState): AiStreamState {
  return { ...state, status: 'done', stopped: true };
}

export function failStream(state: AiStreamState, message: string): AiStreamState {
  return { ...state, status: 'error', error: message };
}
