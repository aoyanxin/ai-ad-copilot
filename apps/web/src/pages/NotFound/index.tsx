import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_ROUTE_PATH } from '@ai-ad-copilot/shared';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle="页面不存在"
      extra={
        <Button type="primary" onClick={() => navigate(DEFAULT_ROUTE_PATH)}>
          返回看板
        </Button>
      }
    />
  );
}
