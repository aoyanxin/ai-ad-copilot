import { AD_CHANNELS, type AdChannel } from '@ai-ad-copilot/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

import { parseStringArray } from './transforms';

/**
 * 看板公共查询参数。
 *
 * 这里只做"格式"校验：日期形状（正则）+ 真实日历（ISO8601 strict）+
 * 渠道白名单。起止颠倒、跨度超限这类业务语义在 service 层用
 * validateDashboardDateRange 处理，保证错误码可以区分 40000 / 40001。
 */
export class DashboardQueryDto {
  /** 起始日期（含），YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;

  /** 结束日期（含），YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;

  /** 渠道多选：逗号分隔或重复 key，省略 / 空数组表示全部渠道 */
  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsIn(AD_CHANNELS, { each: true })
  channels?: AdChannel[];

  /** 单个广告计划 ID，省略表示不限 */
  @IsOptional()
  @IsString()
  planId?: string;
}
