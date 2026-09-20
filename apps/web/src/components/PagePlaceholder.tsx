import { Card, Empty, Typography } from 'antd';

export interface PagePlaceholderProps {
  title: string;
  description: string;
}

/**
 * Day1 骨架期的页面占位组件：统一 loading/空状态/错误态的落点，
 * 后续各页面接入真实数据时替换即可。
 */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <Card>
      <Typography.Title level={3}>{title}</Typography.Title>
      <Empty description={description} />
    </Card>
  );
}
