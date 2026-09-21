import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createMockAiService } from '../../services/ai';
import { AiCopilotPage } from './index';

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('产品名'), '秋季轻薄风衣');
  await user.type(screen.getByLabelText('目标人群'), '25-35 岁通勤女性');
}

describe('AiCopilotPage', () => {
  it('填写表单后点击生成，流式展示 3 个版本', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 0 })} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '生成文案' }));

    await waitFor(() => expect(screen.getByText(/版本 1 · 卖点直达/)).toBeInTheDocument());
    expect(screen.getByText(/版本 2 · 场景共鸣/)).toBeInTheDocument();
    expect(screen.getByText(/版本 3 · 利益点/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('copy-text-0').textContent?.length).toBeGreaterThan(10);
    });
    expect(screen.getByTestId('copy-text-1').textContent).toContain('通勤');
    expect(screen.getByTestId('copy-text-2').textContent).toContain('立减');
  });

  it('缺少必填项时不发起生成', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 0 })} />);

    await user.click(screen.getByRole('button', { name: '生成文案' }));

    expect(await screen.findByText('请输入产品名')).toBeInTheDocument();
    expect(screen.queryByTestId('copy-text-0')).not.toBeInTheDocument();
  });

  it('打分显示分数与理由', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 0 })} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '生成文案' }));
    await waitFor(() => expect(screen.getByTestId('copy-text-0').textContent?.length).toBeGreaterThan(10));

    const firstCard = screen.getByText(/版本 1 · 卖点直达/).closest('.ant-card') as HTMLElement;
    // antd 会在两个汉字的按钮标签之间自动插入空格
    await user.click(within(firstCard).getByRole('button', { name: '打 分' }));

    await waitFor(() => expect(within(firstCard).getByText(/AI 评分/)).toBeInTheDocument());
    // 评分卡数值形如 "86 分"，理由里也会出现分数，这里只匹配独立的数值节点
    expect(within(firstCard).getByText(/^\d+ 分$/)).toBeInTheDocument();
    expect(within(firstCard).getByText(/mock 评审结果/)).toBeInTheDocument();
  });

  it('改写会替换该版本的文案', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 0 })} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '生成文案' }));
    await waitFor(() => expect(screen.getByTestId('copy-text-0').textContent?.length).toBeGreaterThan(10));

    const firstCard = screen.getByText(/版本 1 · 卖点直达/).closest('.ant-card') as HTMLElement;
    await user.type(within(firstCard).getByPlaceholderText(/改写要求/), '更短更有冲击力');
    await user.click(within(firstCard).getByRole('button', { name: '改 写' }));

    await waitFor(() =>
      expect(screen.getByTestId('copy-text-0').textContent).toContain('已按「更短更有冲击力」改写'),
    );
  });

  it('生成失败时显示错误与重试', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 0, failWith: 'rate_limit' })} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '生成文案' }));

    expect(await screen.findByText('文案生成失败')).toBeInTheDocument();
    expect(screen.getByText(/限流/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重 试' })).toBeInTheDocument();
  });

  it('可以停止生成并提示保留内容', async () => {
    const user = userEvent.setup();
    render(<AiCopilotPage service={createMockAiService({ chunkDelayMs: 20 })} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '生成文案' }));
    await user.click(await screen.findByRole('button', { name: '停止生成' }));

    expect(await screen.findByText('已停止生成，已生成的内容会保留')).toBeInTheDocument();
  });
});
