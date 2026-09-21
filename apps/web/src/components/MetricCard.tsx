import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { Card, Skeleton, Space, Typography } from 'antd';

import { formatDelta } from '../utils/format';

export interface MetricCardProps {
  label: string;
  /** 已格式化好的指标值（格式化口径统一由 utils/format 提供） */
  value: string;
  /** 环比变化率，null 表示无法计算 */
  delta?: number | null;
  /** 指标上升是否代表变好，用于环比配色；消耗类指标为 false */
  positiveIsGood?: boolean;
  loading?: boolean;
  /** 非环比场景（如 AI 评分）可以关掉底部那行 */
  showDelta?: boolean;
}

const GOOD_COLOR = '#389e0d';
const BAD_COLOR = '#cf1322';
const NEUTRAL_COLOR = 'rgba(0, 0, 0, 0.45)';

/** 指标卡：数值 + 环比，统一 loading 骨架与异常值兜底 */
export function MetricCard({
  label,
  value,
  delta = null,
  positiveIsGood = true,
  loading = false,
  showDelta = true,
}: MetricCardProps) {
  const deltaDirection = delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const isGood = deltaDirection === 'flat' ? null : (deltaDirection === 'up') === positiveIsGood;
  const deltaColor = isGood === null ? NEUTRAL_COLOR : isGood ? GOOD_COLOR : BAD_COLOR;

  return (
    <Card size="small" data-testid={`metric-card-${label}`}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      ) : (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Typography.Text type="secondary">{label}</Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {value}
          </Typography.Title>
          {showDelta ? (
            <Typography.Text style={{ fontSize: 12, color: deltaColor }}>
              {deltaDirection === 'up' ? (
                <ArrowUpOutlined />
              ) : deltaDirection === 'down' ? (
                <ArrowDownOutlined />
              ) : (
                <MinusOutlined />
              )}{' '}
              {formatDelta(delta)} 环比
            </Typography.Text>
          ) : null}
        </Space>
      )}
    </Card>
  );
}
