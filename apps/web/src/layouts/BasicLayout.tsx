import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons';
import { APP_NAME, DEFAULT_ROUTE_PATH } from '@ai-ad-copilot/shared';
import { Avatar, Button, Layout, Menu, Space, Typography } from 'antd';
import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { NAV_ITEMS } from '../router/nav-items';
import { useAppStore } from '../stores/appStore';

const { Content, Header, Sider } = Layout;

export function BasicLayout() {
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const navigate = useNavigate();
  const location = useLocation();

  const activeKey = useMemo(() => {
    const matched = NAV_ITEMS.find((item) => location.pathname === item.key);
    return matched?.key ?? DEFAULT_ROUTE_PATH;
  }, [location.pathname]);

  const currentTitle = useMemo(
    () => NAV_ITEMS.find((item) => item.key === activeKey)?.label ?? '页面未找到',
    [activeKey],
  );

  const menuItems = useMemo(
    () =>
      NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return { key: item.key, label: item.label, icon: <Icon /> };
      }),
    [],
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} collapsedWidth={64} collapsed={collapsed} trigger={null}>
        <div className="app-logo">{collapsed ? 'AI' : APP_NAME}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Button
            type="text"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSidebar}
          />
          <Typography.Title level={4} className="app-header__title">
            {currentTitle}
          </Typography.Title>
          <Space size={8}>
            <Avatar size="small" icon={<UserOutlined />} />
            <Typography.Text type="secondary">Demo 用户</Typography.Text>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
