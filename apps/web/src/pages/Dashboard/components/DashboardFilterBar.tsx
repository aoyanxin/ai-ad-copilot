import { ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { AD_CHANNELS, type AdChannel, type AdPlanOption } from '@ai-ad-copilot/shared';
import { Button, Card, DatePicker, Select, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useMemo } from 'react';

import { CHANNEL_LABELS } from '../constants';
import type { DashboardFilter } from '../utils/filters';

const DATE_FORMAT = 'YYYY-MM-DD';

export interface DashboardFilterBarProps {
  value: DashboardFilter;
  onChange: (next: DashboardFilter) => void;
  onReset: () => void;
  onRefresh: () => void;
  /** 广告计划下拉选项（已按渠道收窄） */
  planOptions: AdPlanOption[];
  plansLoading?: boolean;
  refreshing?: boolean;
  /** 数据截止时间（ISO 字符串） */
  updatedAt?: string | null;
}

/** 顶部筛选栏：日期范围、渠道多选、广告计划下拉；受控组件，状态由页面/store 持有 */
export function DashboardFilterBar({
  value,
  onChange,
  onReset,
  onRefresh,
  planOptions,
  plansLoading = false,
  refreshing = false,
  updatedAt = null,
}: DashboardFilterBarProps) {
  const rangeValue = useMemo<[Dayjs, Dayjs]>(
    () => [dayjs(value.from), dayjs(value.to)],
    [value.from, value.to],
  );

  const presets = useMemo(
    () => [
      { label: '近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] as [Dayjs, Dayjs] },
      { label: '近 14 天', value: [dayjs().subtract(13, 'day'), dayjs()] as [Dayjs, Dayjs] },
      { label: '近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] as [Dayjs, Dayjs] },
    ],
    [],
  );

  const channelOptions = useMemo(
    () => AD_CHANNELS.map((channel) => ({ value: channel, label: CHANNEL_LABELS[channel] })),
    [],
  );

  const planSelectOptions = useMemo(() => {
    const options = planOptions.map((plan) => ({
      value: plan.planId,
      label: `${plan.planName}（${CHANNEL_LABELS[plan.channel]}）`,
    }));

    // 已选计划可能因为渠道收窄而不在最新选项里，保证仍能正确回显标签
    if (value.plan && !options.some((option) => option.value === value.plan?.planId)) {
      options.unshift({
        value: value.plan.planId,
        label: `${value.plan.planName}（${CHANNEL_LABELS[value.plan.channel]}）`,
      });
    }

    return options;
  }, [planOptions, value.plan]);

  const handlePlanChange = useCallback(
    (planId?: string) => {
      const matched = planOptions.find((plan) => plan.planId === planId);
      onChange({ ...value, plan: matched ?? (value.plan?.planId === planId ? value.plan : null) });
    },
    [onChange, planOptions, value],
  );

  return (
    <Card size="small" data-testid="dashboard-filter-bar">
      <Space wrap size={12} align="center">
        <Space size={8} align="center">
          <Typography.Text type="secondary">日期</Typography.Text>
          <div data-testid="date-range-filter">
            <DatePicker.RangePicker
              value={rangeValue}
              allowClear={false}
              format={DATE_FORMAT}
              presets={presets}
              onChange={(dates) => {
                const start = dates?.[0];
                const end = dates?.[1];
                if (!start || !end) {
                  return;
                }
                onChange({ ...value, from: start.format(DATE_FORMAT), to: end.format(DATE_FORMAT) });
              }}
            />
          </div>
        </Space>

        <Space size={8} align="center">
          <Typography.Text type="secondary">渠道</Typography.Text>
          <div data-testid="channel-filter">
            <Select<AdChannel[]>
              mode="multiple"
              allowClear
              placeholder="全部渠道"
              style={{ minWidth: 200 }}
              value={value.channels}
              options={channelOptions}
              onChange={(channels) => onChange({ ...value, channels })}
            />
          </div>
        </Space>

        <Space size={8} align="center">
          <Typography.Text type="secondary">广告计划</Typography.Text>
          <div data-testid="plan-filter">
            <Select
              showSearch
              allowClear
              placeholder="全部计划"
              style={{ minWidth: 220 }}
              optionFilterProp="label"
              loading={plansLoading}
              value={value.plan?.planId}
              options={planSelectOptions}
              onChange={handlePlanChange}
            />
          </div>
        </Space>

        <Space size={8}>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>
            刷新
          </Button>
          <Button icon={<UndoOutlined />} onClick={onReset}>
            重置
          </Button>
        </Space>

        {updatedAt ? (
          <Typography.Text type="secondary">数据截止 {updatedAt.slice(0, 10)}</Typography.Text>
        ) : null}
      </Space>
    </Card>
  );
}
