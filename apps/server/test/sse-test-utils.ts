/** SSE 报文的测试工具：把原始响应文本解析成 { event, data } 序列 */

export interface SseTestFrame {
  event: string;
  data: Record<string, unknown>;
}

export function parseSseFrames(text: string): SseTestFrame[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
      const rawData = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}';

      return { event, data: JSON.parse(rawData) as Record<string, unknown> };
    });
}

export function frameNames(text: string): string[] {
  return parseSseFrames(text).map((frame) => frame.event);
}

/** 按 index 合并 delta 文本 */
export function mergeDeltaText(text: string): Map<number, string> {
  const merged = new Map<number, string>();

  parseSseFrames(text)
    .filter((frame) => frame.event === 'delta')
    .forEach((frame) => {
      const index = Number(frame.data.index);
      merged.set(index, `${merged.get(index) ?? ''}${String(frame.data.text ?? '')}`);
    });

  return merged;
}
