import {
  COPYWRITING_MAX_VARIANTS,
  type ScoreResult,
} from '@ai-ad-copilot/shared';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';

import { useSseStream } from '../../hooks/useSseStream';
import { getAiService, type AiService } from '../../services/ai';
import { getErrorMessage } from '../../services/http';
import { CopywritingForm, type CopywritingFormValues } from './components/CopywritingForm';
import { CopyVariantCard } from './components/CopyVariantCard';

export interface AiCopilotPageProps {
  /** 数据源默认按 VITE_API_MODE 选择 mock / HTTP；测试可注入替身 */
  service?: AiService;
}

interface ScoreState {
  index: number | null;
  loading: boolean;
  error: string | null;
}

/** AI 文案助手：填场景 → 流式生成 3 个版本 → 改写 / 打分 */
export function AiCopilotPage({ service = getAiService() }: AiCopilotPageProps = {}) {
  const stream = useSseStream(service);
  const [lastValues, setLastValues] = useState<CopywritingFormValues | null>(null);
  const [scores, setScores] = useState<Record<number, ScoreResult>>({});
  const [scoreState, setScoreState] = useState<ScoreState>({
    index: null,
    loading: false,
    error: null,
  });

  const cardIndexes = useMemo(
    () => Array.from({ length: stream.variantCount }, (_, index) => index),
    [stream.variantCount],
  );

  const startGeneration = useCallback(
    (values: CopywritingFormValues) => {
      setScores({});
      setScoreState({ index: null, loading: false, error: null });
      stream.startCopywriting({ ...values, variants: COPYWRITING_MAX_VARIANTS });
    },
    [stream],
  );

  const handleGenerate = useCallback(
    (values: CopywritingFormValues) => {
      setLastValues(values);
      startGeneration(values);
    },
    [startGeneration],
  );

  const handleRewrite = useCallback(
    (index: number, instruction: string) => {
      const original = stream.variants[index] ?? '';
      if (original.length === 0) {
        return;
      }

      setScores((previous) => {
        const next = { ...previous };
        delete next[index];
        return next;
      });
      stream.startRewrite({ original, instruction }, index);
    },
    [stream],
  );

  const handleScore = useCallback(
    async (index: number) => {
      const copy = stream.variants[index] ?? '';
      if (copy.trim().length === 0) {
        return;
      }

      setScoreState({ index, loading: true, error: null });

      try {
        const [result] = await service.scoreCopywriting([copy]);
        setScores((previous) => ({ ...previous, [index]: { ...result, index } }));
        setScoreState({ index: null, loading: false, error: null });
      } catch (error) {
        setScoreState({ index: null, loading: false, error: getErrorMessage(error) });
      }
    },
    [service, stream.variants],
  );

  const streaming = stream.status === 'streaming';

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        AI 文案助手
      </Typography.Title>
      <Typography.Text type="secondary">
        填写投放场景，一次生成 3 个角度的文案；支持流式改写与逐条打分。
      </Typography.Text>

      <CopywritingForm onSubmit={handleGenerate} onStop={stream.stop} streaming={streaming} />

      {stream.error ? (
        <Alert
          type="error"
          showIcon
          message="文案生成失败"
          description={stream.error}
          action={
            lastValues ? (
              <Button size="small" onClick={() => startGeneration(lastValues)}>
                重试
              </Button>
            ) : null
          }
        />
      ) : null}

      {stream.stopped && stream.status === 'done' ? (
        <Alert type="info" showIcon message="已停止生成，已生成的内容会保留" />
      ) : null}

      {cardIndexes.length > 0 ? (
        <Row gutter={[12, 12]}>
          {cardIndexes.map((index) => (
            <Col key={index} xs={24} xl={8}>
              <CopyVariantCard
                index={index}
                angle={stream.angles[index] ?? null}
                text={stream.variants[index] ?? ''}
                streaming={streaming && !(stream.finished[index] ?? false)}
                finished={stream.finished[index] ?? false}
                score={scores[index] ?? null}
                scoring={scoreState.loading && scoreState.index === index}
                scoreError={scoreState.index === null ? scoreState.error : null}
                onRewrite={handleRewrite}
                onScore={handleScore}
              />
            </Col>
          ))}
        </Row>
      ) : (
        <Card size="small">
          <Typography.Text type="secondary">
            填写表单后点击「生成文案」，这里会流式展示 3 个版本。
          </Typography.Text>
        </Card>
      )}
    </Space>
  );
}

export default AiCopilotPage;
