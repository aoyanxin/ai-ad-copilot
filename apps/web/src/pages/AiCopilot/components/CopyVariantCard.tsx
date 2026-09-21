import type { CopywritingVariantAngle, ScoreResult } from '@ai-ad-copilot/shared';
import { Alert, Button, Input, Skeleton, Space, Typography } from 'antd';

import { ChartCard } from '../../../components/ChartCard';
import { MetricCard } from '../../../components/MetricCard';
import { ANGLE_LABELS } from '../constants';

export interface CopyVariantCardProps {
  index: number;
  angle: CopywritingVariantAngle | null;
  text: string;
  /** 该版本仍在流式生成中 */
  streaming: boolean;
  finished: boolean;
  score: ScoreResult | null;
  scoring: boolean;
  scoreError: string | null;
  onRewrite: (index: number, instruction: string) => void;
  onScore: (index: number) => void;
}

/** 单个版本文案卡片：流式文本 + 改写 + 打分 */
export function CopyVariantCard({
  index,
  angle,
  text,
  streaming,
  finished,
  score,
  scoring,
  scoreError,
  onRewrite,
  onScore,
}: CopyVariantCardProps) {
  const title = `版本 ${index + 1}${angle ? ` · ${ANGLE_LABELS[angle]}` : ''}`;
  const hasText = text.length > 0;

  return (
    <ChartCard
      title={title}
      subtitle={finished ? '已生成' : streaming ? '生成中…' : undefined}
      extra={
        <Button
          size="small"
          onClick={() => onScore(index)}
          loading={scoring}
          disabled={!hasText || streaming}
        >
          打分
        </Button>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {hasText ? (
          <Typography.Paragraph
            data-testid={`copy-text-${index}`}
            style={{ whiteSpace: 'pre-wrap', marginBottom: 0, minHeight: 48 }}
          >
            {text}
            {streaming ? <span aria-hidden="true">▍</span> : null}
          </Typography.Paragraph>
        ) : streaming ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : (
          <Typography.Text type="secondary">尚未生成</Typography.Text>
        )}

        <Input.Search
          placeholder="改写要求，例如：更短、更有冲击力"
          enterButton="改写"
          disabled={!hasText || streaming}
          onSearch={(value) => {
            const instruction = value.trim();
            if (instruction.length > 0) {
              onRewrite(index, instruction);
            }
          }}
        />

        {score ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <MetricCard
              label={`版本 ${index + 1} AI 评分`}
              value={`${score.score} 分`}
              showDelta={false}
            />
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {score.reasons.map((reason) => (
                <li key={reason}>
                  <Typography.Text type="secondary">{reason}</Typography.Text>
                </li>
              ))}
            </ul>
          </Space>
        ) : null}

        {scoreError ? <Alert type="error" showIcon message={scoreError} /> : null}
      </Space>
    </ChartCard>
  );
}
