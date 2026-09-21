import type { AiStreamEvent } from '@ai-ad-copilot/shared';
import { describe, expect, it } from 'vitest';

import {
  beginStream,
  failStream,
  reduceAiStreamEvent,
  stopStream,
  INITIAL_AI_STREAM_STATE,
  type AiStreamState,
} from './stream';

function reduce(events: AiStreamEvent[], options = {}): AiStreamState {
  return events.reduce(
    (state, event) => reduceAiStreamEvent(state, event, options),
    beginStream(INITIAL_AI_STREAM_STATE),
  );
}

describe('reduceAiStreamEvent', () => {
  it('meta 决定版本数并初始化数组', () => {
    const state = reduce([{ event: 'meta', data: { model: 'deepseek-chat', variantCount: 3, requestId: 'r' } }]);

    expect(state.status).toBe('streaming');
    expect(state.model).toBe('deepseek-chat');
    expect(state.variantCount).toBe(3);
    expect(state.variants).toEqual(['', '', '']);
    expect(state.angles).toEqual([null, null, null]);
    expect(state.finished).toEqual([false, false, false]);
  });

  it('variant 记录角度', () => {
    const state = reduce([
      { event: 'meta', data: { model: 'm', variantCount: 3, requestId: 'r' } },
      { event: 'variant', data: { index: 1, angle: 'scenario' } },
    ]);

    expect(state.angles[1]).toBe('scenario');
  });

  it('delta 按 index 累积，互不干扰', () => {
    const state = reduce([
      { event: 'meta', data: { model: 'm', variantCount: 3, requestId: 'r' } },
      { event: 'delta', data: { index: 0, text: 'A1' } },
      { event: 'delta', data: { index: 2, text: 'C1' } },
      { event: 'delta', data: { index: 0, text: 'A2' } },
    ]);

    expect(state.variants).toEqual(['A1A2', '', 'C1']);
  });

  it('variant-done 标记完成，done 结束整条流', () => {
    const state = reduce([
      { event: 'meta', data: { model: 'm', variantCount: 2, requestId: 'r' } },
      { event: 'variant-done', data: { index: 0, finishReason: 'stop', chars: 3 } },
      { event: 'variant-done', data: { index: 1, finishReason: 'stop', chars: 3 } },
      { event: 'done', data: { durationMs: 1234, variantCount: 2 } },
    ]);

    expect(state.finished).toEqual([true, true]);
    expect(state.status).toBe('done');
    expect(state.durationMs).toBe(1234);
  });

  it('error 事件进入错误态并保留已生成文本', () => {
    const state = reduce([
      { event: 'meta', data: { model: 'm', variantCount: 3, requestId: 'r' } },
      { event: 'delta', data: { index: 0, text: '已生成' } },
      { event: 'error', data: { code: 42900, message: '限流', index: 1 } },
    ]);

    expect(state.status).toBe('error');
    expect(state.error).toBe('限流');
    expect(state.variants[0]).toBe('已生成');
  });

  it('keepVariants 模式下 meta 不重置已有内容（改写场景）', () => {
    const initial = reduce([
      { event: 'meta', data: { model: 'm', variantCount: 3, requestId: 'r' } },
      { event: 'delta', data: { index: 0, text: '原文本' } },
      { event: 'done', data: { durationMs: 1, variantCount: 3 } },
    ]);

    const rewritten = reduceAiStreamEvent(
      initial,
      { event: 'meta', data: { model: 'm', variantCount: 1, requestId: 'r2' } },
      { keepVariants: true },
    );

    expect(rewritten.variants).toHaveLength(3);
    expect(rewritten.variantCount).toBe(3);
  });
});

describe('beginStream / stopStream / failStream', () => {
  it('beginStream 清空上一轮结果', () => {
    const dirty: AiStreamState = { ...INITIAL_AI_STREAM_STATE, variants: ['旧'], status: 'error', error: 'x' };
    const state = beginStream(dirty);

    expect(state.status).toBe('streaming');
    expect(state.variants).toEqual([]);
    expect(state.error).toBeNull();
  });

  it('beginStream 带目标下标时只清该卡片', () => {
    const dirty: AiStreamState = {
      ...INITIAL_AI_STREAM_STATE,
      variants: ['A', 'B', 'C'],
      variantCount: 3,
      status: 'done',
    };
    const state = beginStream(dirty, 1);

    expect(state.variants).toEqual(['A', '', 'C']);
    expect(state.status).toBe('streaming');
  });

  it('stopStream 保留文本并标记 stopped', () => {
    const state = stopStream({ ...INITIAL_AI_STREAM_STATE, status: 'streaming', variants: ['部分'] });

    expect(state.status).toBe('done');
    expect(state.stopped).toBe(true);
    expect(state.variants).toEqual(['部分']);
  });

  it('failStream 记录错误信息', () => {
    const state = failStream({ ...INITIAL_AI_STREAM_STATE, status: 'streaming' }, '网络异常');

    expect(state.status).toBe('error');
    expect(state.error).toBe('网络异常');
  });
});
