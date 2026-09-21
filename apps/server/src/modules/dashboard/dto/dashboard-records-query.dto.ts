import { AD_PLAN_STATUSES, AD_RECORD_SORT_FIELDS, type AdPlanStatus, type AdRecordSortField, type SortOrder } from '@ai-ad-copilot/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { DashboardQueryDto } from './dashboard-query.dto';
import { parseStringArray } from './transforms';

/** 明细表接口的查询参数：公共筛选 + 分页 + 排序 + 列筛选 */
export class DashboardRecordsQueryDto extends DashboardQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  /** 与前端表格可选的 10 / 20 / 50 对齐，上限留到 100 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize!: number;

  @IsOptional()
  @IsIn(AD_RECORD_SORT_FIELDS)
  sortField?: AdRecordSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder;

  /** 列筛选：状态多选 */
  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsIn(AD_PLAN_STATUSES, { each: true })
  statuses?: AdPlanStatus[];

  /** 列筛选：计划名模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;
}
