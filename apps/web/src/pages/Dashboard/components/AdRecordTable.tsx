import { SearchOutlined } from '@ant-design/icons';
import {
  AD_PLAN_STATUSES,
  isAdPlanStatus,
  type AdChannel,
  type AdPlanRecord,
  type AdPlanStatus,
  type AdRecordSortField,
  type DashboardQuery,
} from '@ai-ad-copilot/shared';
import { Alert, Button, Card, Empty, Input, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useCallback, useMemo, useState } from 'react';

import { useDashboardRecords } from '../../../hooks/useDashboardRecords';
import { getDashboardService, type DashboardService } from '../../../services/dashboard';
import { formatCurrency, formatInteger, formatPercent, formatRatio } from '../../../utils/format';
import {
  AD_PLAN_STATUS_COLORS,
  AD_PLAN_STATUS_LABELS,
  CHANNEL_LABELS,
  TABLE_PAGE_SIZE_OPTIONS,
} from '../constants';
import {
  DEFAULT_TABLE_STATE,
  mergeRecordsQuery,
  resolveTableState,
  toQueryKey,
  type AdRecordTableState,
} from '../utils/filters';

const INITIAL_TABLE_STATE: AdRecordTableState = {
  ...DEFAULT_TABLE_STATE,
  sortField: 'spend',
  sortOrder: 'desc',
};

export interface AdRecordTableProps {
  /** 顶部筛选条件（不含表格自身的分页/排序/列筛选） */
  baseQuery: DashboardQuery;
  service?: DashboardService;
}

/** 广告计划明细表：排序、分页、列筛选全部按服务端语义下推到查询参数 */
export function AdRecordTable({ baseQuery, service = getDashboardService() }: AdRecordTableProps) {
  const [tableState, setTableState] = useState<AdRecordTableState>(INITIAL_TABLE_STATE);
  const [keywordDraft, setKeywordDraft] = useState('');
  const baseQueryKey = toQueryKey(baseQuery);
  const [lastBaseQueryKey, setLastBaseQueryKey] = useState(baseQueryKey);

  // 顶部筛选变化时同步重置分页与列筛选（React 官方推荐的"props 变化调整 state"写法）
  if (baseQueryKey !== lastBaseQueryKey) {
    setLastBaseQueryKey(baseQueryKey);
    setTableState(INITIAL_TABLE_STATE);
    setKeywordDraft('');
  }

  const query = useMemo(() => mergeRecordsQuery(baseQuery, tableState), [baseQuery, tableState]);
  const { data, loading, error, refresh } = useDashboardRecords(query, service);

  const sortOrderOf = useCallback(
    (field: AdRecordSortField) =>
      tableState.sortField === field ? (tableState.sortOrder === 'asc' ? 'ascend' : 'descend') : null,
    [tableState.sortField, tableState.sortOrder],
  );

  const handleTableChange: TableProps<AdPlanRecord>['onChange'] = (
    pagination,
    filters,
    sorter,
  ) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter;

    setTableState((current) =>
      resolveTableState(current, {
        page: pagination.current,
        pageSize: pagination.pageSize,
        sorterField: typeof single?.columnKey === 'string' ? single.columnKey : undefined,
        sorterOrder: single?.order ?? null,
        statuses: (filters.status ?? []).filter(isAdPlanStatus),
      }),
    );
  };

  const applyKeyword = useCallback((keyword: string) => {
    setTableState((current) => resolveTableState(current, { keyword }));
  }, []);

  const columns = useMemo<TableProps<AdPlanRecord>['columns']>(
    () => [
      {
        title: '计划名',
        dataIndex: 'planName',
        key: 'planName',
        width: 220,
        filterIcon: (filtered) => (
          <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
        ),
        // antd 要求所有可筛选列统一受控：filteredValue 为空表示未筛选
        filteredValue: tableState.keyword.length > 0 ? [tableState.keyword] : null,
        filterDropdown: ({ confirm, close }) => (
          <div style={{ padding: 8 }} onKeyDown={(event) => event.stopPropagation()}>
            <Input
              autoFocus
              allowClear
              placeholder="搜索计划名"
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onPressEnter={() => {
                applyKeyword(keywordDraft);
                confirm({ closeDropdown: true });
              }}
              style={{ width: 200, marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  applyKeyword(keywordDraft);
                  confirm({ closeDropdown: true });
                }}
              >
                搜索
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setKeywordDraft('');
                  applyKeyword('');
                  close();
                }}
              >
                重置
              </Button>
            </Space>
          </div>
        ),
      },
      {
        title: '渠道',
        dataIndex: 'channel',
        key: 'channel',
        width: 110,
        render: (channel: AdChannel) => CHANNEL_LABELS[channel],
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        filters: AD_PLAN_STATUSES.map((status) => ({
          text: AD_PLAN_STATUS_LABELS[status],
          value: status,
        })),
        filteredValue: tableState.statuses.length > 0 ? tableState.statuses : null,
        render: (status: AdPlanStatus) => (
          <Tag color={AD_PLAN_STATUS_COLORS[status]}>{AD_PLAN_STATUS_LABELS[status]}</Tag>
        ),
      },
      {
        title: '消耗',
        dataIndex: 'spend',
        key: 'spend',
        width: 140,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('spend'),
        render: (value: number) => formatCurrency(value),
      },
      {
        title: '收入',
        dataIndex: 'revenue',
        key: 'revenue',
        width: 140,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('revenue'),
        render: (value: number) => formatCurrency(value),
      },
      {
        title: '点击',
        dataIndex: 'clicks',
        key: 'clicks',
        width: 110,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('clicks'),
        render: (value: number) => formatInteger(value),
      },
      {
        title: '转化',
        dataIndex: 'conversions',
        key: 'conversions',
        width: 110,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('conversions'),
        render: (value: number) => formatInteger(value),
      },
      {
        title: 'CTR',
        dataIndex: 'ctr',
        key: 'ctr',
        width: 100,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('ctr'),
        render: (value: number) => formatPercent(value),
      },
      {
        title: 'CVR',
        dataIndex: 'cvr',
        key: 'cvr',
        width: 100,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('cvr'),
        render: (value: number) => formatPercent(value),
      },
      {
        title: 'ROI',
        dataIndex: 'roi',
        key: 'roi',
        width: 100,
        align: 'right',
        sorter: true,
        sortOrder: sortOrderOf('roi'),
        render: (value: number) => formatRatio(value),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 130,
        sorter: true,
        sortOrder: sortOrderOf('updatedAt'),
        render: (value: string) => value.slice(0, 10),
      },
    ],
    [applyKeyword, keywordDraft, sortOrderOf, tableState.keyword, tableState.statuses],
  );

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <Typography.Text strong>广告计划明细</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            共 {data?.total ?? 0} 条（服务端分页 / 排序 / 筛选）
          </Typography.Text>
        </Space>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="明细数据加载失败"
          description={error}
          action={
            <Button size="small" onClick={refresh}>
              重试
            </Button>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Table<AdPlanRecord>
        size="small"
        rowKey="planId"
        scroll={{ x: 1280 }}
        columns={columns}
        dataSource={data?.list ?? []}
        loading={loading}
        onChange={handleTableChange}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的广告计划" />
          ),
        }}
        pagination={{
          current: tableState.page,
          pageSize: tableState.pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS.map(String),
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Card>
  );
}
