import type { DashboardOverview, DashboardRecordsResponse } from '@ai-ad-copilot/shared';
import { Controller, Get, Query } from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardRecordsQueryDto } from './dto/dashboard-records-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 指标卡 + 趋势 + 渠道对比 + 漏斗，一次请求返回整屏聚合结果 */
  @Get('overview')
  getOverview(@Query() query: DashboardQueryDto): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(query);
  }

  /** 广告计划明细：服务端分页 / 排序 / 列筛选 */
  @Get('records')
  getRecords(@Query() query: DashboardRecordsQueryDto): Promise<DashboardRecordsResponse> {
    return this.dashboardService.getRecords(query);
  }
}
