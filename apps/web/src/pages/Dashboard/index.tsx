import type { ChannelMetric, FunnelStage, TrendPoint } from '@ai-ad-copilot/shared';
import { Alert, Button, Card, Col, Row, Skeleton, Space, Typography } from 'antd';
import { Suspense, lazy, useMemo } from 'react';

import { ChartCard } from '../../components/ChartCard';
import { MetricCard } from '../../components/MetricCard';
import { ChannelBarChart } from '../../components/charts/ChannelBarChart';
import { ConversionFunnelChart } from '../../components/charts/ConversionFunnelChart';
import { TrendChart } from '../../components/charts/TrendChart';
import { useAdPlans } from '../../hooks/useAdPlans';
import { useDashboardOverview } from '../../hooks/useDashboardOverview';
import { getDashboardService, type DashboardService } from '../../services/dashboard';
import { useDashboardFilterStore } from '../../stores/dashboardFilterStore';
import { formatDateRangeLabel } from '../../utils/format';
import { DashboardFilterBar } from './components/DashboardFilterBar';
import { CHANNEL_LABELS, FUNNEL_STAGE_LABELS } from './constants';
import { toDashboardQuery } from './utils/filters';
import { buildMetricCards } from './utils/metrics';

/** 引用稳定的空数组，避免每次渲染都生成新引用导致图表重复 setOption */
const EMPTY_TREND: TrendPoint[] = [];
const EMPTY_CHANNELS: ChannelMetric[] = [];
const EMPTY_FUNNEL: FunnelStage[] = [];

/**
 * 明细表（antd Table + 分页/筛选）是页面上最重的部分，
 * 单独懒加载：看板骨架与图表先渲染，表格 chunk 随后补齐。
 */
const AdRecordTable = lazy(() =>
  import('./components/AdRecordTable').then((module) => ({ default: module.AdRecordTable })),
);

export interface DashboardPageProps {
  /** 数据源，默认按 VITE_API_MODE 选择 mock / HTTP；测试可注入替身 */
  service?: DashboardService;
}

/** 广告数据看板：筛选 -> 指标卡 -> 图表 -> 明细表 */
export function DashboardPage({ service = getDashboardService() }: DashboardPageProps = {}) {
  const filter = useDashboardFilterStore((state) => state.filter);
  const setFilter = useDashboardFilterStore((state) => state.setFilter);
  const resetFilters = useDashboardFilterStore((state) => state.resetFilters);

  const query = useMemo(() => toDashboardQuery(filter), [filter]);
  const planQuery = useMemo(() => ({ channels: filter.channels }), [filter.channels]);

  const overview = useDashboardOverview(query, service);
  const plans = useAdPlans(planQuery, service);

  const metrics = overview.data?.metrics ?? null;
  const previousMetrics = overview.data?.previous ?? null;
  const metricCards = useMemo(
    () => buildMetricCards(metrics, previousMetrics),
    [metrics, previousMetrics],
  );

  const trend = overview.data?.trend ?? EMPTY_TREND;
  const channels = overview.data?.channels ?? EMPTY_CHANNELS;
  const funnel = overview.data?.funnel ?? EMPTY_FUNNEL;

  const metricsLoading = overview.loading && metrics === null;
  const chartLoading = overview.loading && overview.data === null;
  // 出错时保留上一次数据，图表不要误报"无数据"
  const chartEmpty = (data: readonly unknown[]) =>
    !chartLoading && overview.error === null && data.length === 0;

  const handleRefresh = () => {
    overview.refresh();
    plans.refresh();
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        广告数据看板
      </Typography.Title>

      <DashboardFilterBar
        value={filter}
        onChange={setFilter}
        onReset={resetFilters}
        onRefresh={handleRefresh}
        planOptions={plans.data ?? []}
        plansLoading={plans.loading}
        refreshing={overview.loading}
        updatedAt={overview.data?.updatedAt ?? null}
      />

      {overview.error ? (
        <Alert
          type="error"
          showIcon
          message="看板数据加载失败"
          description={overview.error}
          action={
            <Button size="small" onClick={overview.refresh}>
              重试
            </Button>
          }
        />
      ) : null}

      <Row gutter={[12, 12]}>
        {metricCards.map((card) => (
          <Col key={card.key} xs={24} sm={12} xl={8} xxl={4}>
            <MetricCard
              label={card.label}
              value={card.value}
              delta={card.delta}
              positiveIsGood={card.positiveIsGood}
              loading={metricsLoading}
            />
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <ChartCard title="消耗 / 点击趋势" subtitle={formatDateRangeLabel(query.from, query.to)}>
            <TrendChart
              data={trend}
              loading={chartLoading}
              empty={chartEmpty(trend)}
              onRetry={overview.refresh}
            />
          </ChartCard>
        </Col>
        <Col xs={24} xl={8}>
          <ChartCard title="渠道对比" subtitle="消耗 / 收入">
            <ChannelBarChart
              data={channels}
              channelLabels={CHANNEL_LABELS}
              loading={chartLoading}
              empty={chartEmpty(channels)}
              onRetry={overview.refresh}
            />
          </ChartCard>
        </Col>
      </Row>

          <ChartCard title="转化漏斗" subtitle="曝光 → 点击 → 转化 → 成交">
        <ConversionFunnelChart
          data={funnel}
          stageLabels={FUNNEL_STAGE_LABELS}
          loading={chartLoading}
          empty={funnel.every((stage) => stage.value === 0) || chartEmpty(funnel)}
          onRetry={overview.refresh}
        />
      </ChartCard>

      <Suspense
        fallback={
          <Card size="small">
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
        }
      >
        <AdRecordTable baseQuery={query} service={service} />
      </Suspense>
    </Space>
  );
}

export default DashboardPage;
