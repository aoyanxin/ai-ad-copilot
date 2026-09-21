import { describe, expect, it } from 'vitest';

import {
  AI_STREAM_EVENTS,
  COPYWRITING_MAX_VARIANTS,
  COPYWRITING_TONES,
  COPYWRITING_VARIANT_ANGLES,
  isAiStreamEventName,
  isCopywritingTone,
  isCopywritingVariantAngle,
} from './ai';

describe('AI 契约常量', () => {
  it('语气白名单固定为三种', () => {
    expect(COPYWRITING_TONES).toEqual(['professional', 'casual', 'urgent']);
  });

  it('版本数与角度一一对应（3 路并发 = 3 个角度）', () => {
    expect(COPYWRITING_MAX_VARIANTS).toBe(3);
    expect(COPYWRITING_VARIANT_ANGLES).toHaveLength(COPYWRITING_MAX_VARIANTS);
    expect(new Set(COPYWRITING_VARIANT_ANGLES).size).toBe(COPYWRITING_MAX_VARIANTS);
  });

  it('流式事件名与协议顺序一致', () => {
    expect(AI_STREAM_EVENTS).toEqual([
      'meta',
      'variant',
      'delta',
      'variant-done',
      'done',
      'error',
    ]);
  });
});

describe('AI 契约类型守卫', () => {
  it('isCopywritingTone', () => {
    expect(isCopywritingTone('professional')).toBe(true);
    expect(isCopywritingTone('urgent')).toBe(true);
    expect(isCopywritingTone('formal')).toBe(false);
    expect(isCopywritingTone(undefined)).toBe(false);
  });

  it('isCopywritingVariantAngle', () => {
    expect(isCopywritingVariantAngle('selling_point')).toBe(true);
    expect(isCopywritingVariantAngle('benefit')).toBe(true);
    expect(isCopywritingVariantAngle('random')).toBe(false);
  });

  it('isAiStreamEventName', () => {
    expect(isAiStreamEventName('delta')).toBe(true);
    expect(isAiStreamEventName('variant-done')).toBe(true);
    expect(isAiStreamEventName('message')).toBe(false);
    expect(isAiStreamEventName(42)).toBe(false);
  });
});
