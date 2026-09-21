import { AD_CHANNELS, type AdChannel, type CopywritingTone } from '@ai-ad-copilot/shared';
import { Button, Card, Form, Input, Radio, Select, Space } from 'antd';

import { CHANNEL_LABELS } from '../../Dashboard/constants';
import { TONE_OPTIONS } from '../constants';

export interface CopywritingFormValues {
  product: string;
  audience: string;
  channel?: AdChannel;
  tone: CopywritingTone;
}

export interface CopywritingFormProps {
  onSubmit: (values: CopywritingFormValues) => void;
  onStop: () => void;
  streaming: boolean;
}

/** 产品信息表单：产品名 / 目标人群 / 投放渠道 / 语气 */
export function CopywritingForm({ onSubmit, onStop, streaming }: CopywritingFormProps) {
  return (
    <Card size="small" title="投放场景">
      <Form<CopywritingFormValues>
        layout="vertical"
        initialValues={{ tone: 'professional' }}
        onFinish={onSubmit}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Form.Item
            label="产品名"
            name="product"
            rules={[
              { required: true, message: '请输入产品名' },
              { min: 2, max: 100, message: '产品名长度 2-100 字' },
            ]}
          >
            <Input placeholder="例如：秋季轻薄风衣" allowClear />
          </Form.Item>

          <Form.Item
            label="目标人群"
            name="audience"
            rules={[
              { required: true, message: '请输入目标人群' },
              { min: 2, max: 100, message: '目标人群长度 2-100 字' },
            ]}
          >
            <Input placeholder="例如：25-35 岁通勤女性" allowClear />
          </Form.Item>

          <Form.Item label="投放渠道" name="channel">
            <Select
              allowClear
              placeholder="不选表示不限渠道"
              options={AD_CHANNELS.map((channel) => ({
                value: channel,
                label: CHANNEL_LABELS[channel],
              }))}
            />
          </Form.Item>

          <Form.Item label="语气" name="tone" rules={[{ required: true }]}>
            <Radio.Group
              options={TONE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </Form.Item>
        </Space>

        <Space size={8} style={{ marginTop: 12 }}>
          {streaming ? (
            <Button danger onClick={onStop}>
              停止生成
            </Button>
          ) : (
            <Button type="primary" htmlType="submit">
              生成文案
            </Button>
          )}
        </Space>
      </Form>
    </Card>
  );
}
