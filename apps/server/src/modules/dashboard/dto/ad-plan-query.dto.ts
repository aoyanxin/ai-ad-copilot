import { AD_CHANNELS, AD_PLAN_STATUSES, type AdChannel, type AdPlanStatus } from '@ai-ad-copilot/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { parseStringArray } from './transforms';

/** GET /api/ad-plans 的查询参数：三个条件都可选 */
export class AdPlanQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsIn(AD_CHANNELS, { each: true })
  channels?: AdChannel[];

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsIn(AD_PLAN_STATUSES, { each: true })
  statuses?: AdPlanStatus[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;
}
