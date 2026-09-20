import { Card, Skeleton } from 'antd';

/** 路由级懒加载的占位骨架，避免异步 chunk 加载期间页面空白 */
export function PageFallback() {
  return (
    <Card size="small" data-testid="page-fallback">
      <Skeleton active paragraph={{ rows: 6 }} />
    </Card>
  );
}
