import { Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** 右上角操作区（如刷新按钮） */
  extra?: ReactNode;
  children: ReactNode;
}

/** 图表卡片外壳：统一标题、副标题与操作区，不掺业务逻辑 */
export function ChartCard({ title, subtitle, extra, children }: ChartCardProps) {
  return (
    <Card
      size="small"
      title={
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{title}</Typography.Text>
          {subtitle ? (
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {subtitle}
            </Typography.Text>
          ) : null}
        </Space>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
