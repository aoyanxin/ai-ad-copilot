import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles/global.css';
import { router } from './router';

const container = document.getElementById('root');

if (!container) {
  throw new Error('未找到 #root 挂载节点');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff' } }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  </React.StrictMode>,
);
