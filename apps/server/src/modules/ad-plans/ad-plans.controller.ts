import type { AdPlanOption } from '@ai-ad-copilot/shared';
import { Controller, Get, Query } from '@nestjs/common';

import { AdPlanQueryDto } from '../dashboard/dto/ad-plan-query.dto';
import { AdPlansService } from './ad-plans.service';

@Controller('ad-plans')
export class AdPlansController {
  constructor(private readonly adPlansService: AdPlansService) {}

  /** 广告计划下拉选项，可按渠道 / 状态 / 关键字收窄 */
  @Get()
  getAdPlans(@Query() query: AdPlanQueryDto): Promise<AdPlanOption[]> {
    return this.adPlansService.getAdPlans(query);
  }
}
