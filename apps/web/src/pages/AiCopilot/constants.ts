import type { CopywritingTone, CopywritingVariantAngle } from '@ai-ad-copilot/shared';

export const TONE_LABELS: Record<CopywritingTone, string> = {
  professional: '专业可信',
  casual: '轻松口语化',
  urgent: '紧迫促单',
};

export const TONE_OPTIONS: { value: CopywritingTone; label: string }[] = [
  { value: 'professional', label: TONE_LABELS.professional },
  { value: 'casual', label: TONE_LABELS.casual },
  { value: 'urgent', label: TONE_LABELS.urgent },
];

export const ANGLE_LABELS: Record<CopywritingVariantAngle, string> = {
  selling_point: '卖点直达',
  scenario: '场景共鸣',
  benefit: '利益点 / 促销',
};
