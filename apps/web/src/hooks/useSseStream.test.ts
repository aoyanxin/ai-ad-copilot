import type { AiStreamEvent, CopywritingRequest } from '@ai-ad-copilot/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createMockAiService, type AiService } from '../services/ai';
import { useSseStream } from './useSseStream';

const REQUEST: CopywritingRequest = {
  product: '秋季轻薄风衣',
  audience: '25-35 岁通勤女性',
  tone: 'professional',
  variants: 3,
};

describe('useSseStream', () => {
  it('流式累积三个版本的文本并进入 done', async () => {
    const service = createMockAiService({ chunkDelayMs: 0 });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.variantCount).toBe(3);
    expect(result.current.variants).toHaveLength(3);
    result.current.variants.forEach((text) => expect(text.length).toBeGreaterThan(0));
    expect(new Set(result.current.variants).size).toBe(3);
    expect(result.current.finished).toEqual([true, true, true]);
  });

  it('主动停止：保留已生成文本，状态为 done 且标记 stopped', async () => {
    const service = createMockAiService({ chunkDelayMs: 20 });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));
    await waitFor(() => expect(result.current.variants.join('').length).toBeGreaterThan(0));

    act(() => result.current.stop());

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.stopped).toBe(true);
    expect(result.current.error).toBeNull();
    const snapshot = result.current.variants.join('');

    // 停止之后不会再有新增内容
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(result.current.variants.join('')).toBe(snapshot);
  });

  it('收到 error 事件进入错误态并给出提示', async () => {
    const service = createMockAiService({ chunkDelayMs: 0, failWith: 'rate_limit' });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('限流');
  });

  it('请求被拒绝（网络异常）进入错误态', async () => {
    const failing: AiService = {
      streamCopywriting: vi.fn().mockRejectedValue(new Error('网络异常，请确认后端服务已启动')),
      streamRewrite: vi.fn(),
      scoreCopywriting: vi.fn(),
    };
    const { result } = renderHook(() => useSseStream(failing));

    act(() => result.current.startCopywriting(REQUEST));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('网络异常，请确认后端服务已启动');
  });

  it('重新生成会中止上一轮并清空结果', async () => {
    const service = createMockAiService({ chunkDelayMs: 10 });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));
    await waitFor(() => expect(result.current.variants.join('').length).toBeGreaterThan(0));

    act(() => result.current.startCopywriting({ ...REQUEST, product: '冬季羽绒服' }));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.variants.join('')).toContain('冬季羽绒服');
  });

  it('改写只替换目标卡片', async () => {
    const service = createMockAiService({ chunkDelayMs: 0 });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));
    await waitFor(() => expect(result.current.status).toBe('done'));
    const originalTexts = [...result.current.variants];

    act(() => result.current.startRewrite({ original: originalTexts[1], instruction: '更短' }, 1));

    await waitFor(() => expect(result.current.variants[1]).toContain('已按'));
    expect(result.current.variants[0]).toBe(originalTexts[0]);
    expect(result.current.variants[2]).toBe(originalTexts[2]);
  });

  it('reset 回到初始态', async () => {
    const service = createMockAiService({ chunkDelayMs: 0 });
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));
    await waitFor(() => expect(result.current.status).toBe('done'));

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.variants).toEqual([]);
  });

  it('不产出未知事件（解析层已过滤，reducer 保持原状）', async () => {
    const events: AiStreamEvent[] = [];
    const service: AiService = {
      streamCopywriting: async (_request, handlers) => {
        handlers.onEvent({ event: 'meta', data: { model: 'm', variantCount: 1, requestId: 'r' } });
        handlers.onEvent({ event: 'delta', data: { index: 0, text: '文本' } });
        handlers.onEvent({ event: 'done', data: { durationMs: 1, variantCount: 1 } });
      },
      streamRewrite: vi.fn(),
      scoreCopywriting: vi.fn(),
    };
    const { result } = renderHook(() => useSseStream(service));

    act(() => result.current.startCopywriting(REQUEST));
    await waitFor(() => expect(result.current.status).toBe('done'));

    expect(result.current.variants[0]).toBe('文本');
    expect(events).toEqual([]);
  });
});
