import { AD_CHANNELS, type AdChannel, type AdPlanOption } from '@ai-ad-copilot/shared';
import { Injectable } from '@nestjs/common';

import { AdPlansRepository } from './ad-plans.repository';
import type { AdPlanQueryDto } from '../dashboard/dto/ad-plan-query.dto';

/**
 * 按 AD_CHANNELS 声明顺序 + planId 排序。
 * 刻意不用 PG 的字母序：那会把 baidu 排到最前，与前端渠道顺序不一致。
 */
export function compareAdPlanOptions(left: AdPlanOption, right: AdPlanOption): number {
  const channelDiff = channelOrder(left.channel) - channelOrder(right.channel);
  return channelDiff !== 0 ? channelDiff : left.planId.localeCompare(right.planId);
}

function channelOrder(channel: AdChannel): number {
  return AD_CHANNELS.indexOf(channel);
}

@Injectable()
export class AdPlansService {
  constructor(private readonly repository: AdPlansRepository) {}

  async getAdPlans(query: AdPlanQueryDto = {}): Promise<AdPlanOption[]> {
    const plans = await this.repository.findAdPlans(query);
    return [...plans].sort(compareAdPlanOptions);
  }
}
