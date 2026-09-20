import {
  AppstoreOutlined,
  BookOutlined,
  DashboardOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { ROUTE_PATHS, type RoutePath } from '@ai-ad-copilot/shared';
import type { ComponentType } from 'react';

export interface NavItem {
  /** 与路由路径一致，同时作为 antd Menu 的 key */
  key: RoutePath;
  label: string;
  /** 存放图标组件本身，JSX 在布局层渲染，保持本文件为纯数据模块 */
  icon: ComponentType;
}

export const NAV_ITEMS: NavItem[] = [
  { key: ROUTE_PATHS.dashboard, label: 'Dashboard', icon: DashboardOutlined },
  { key: ROUTE_PATHS.copilot, label: 'AI Copilot', icon: RobotOutlined },
  { key: ROUTE_PATHS.lowcode, label: 'LowCode', icon: AppstoreOutlined },
  { key: ROUTE_PATHS.rag, label: 'RAG', icon: BookOutlined },
];
