import type { AdPlanOption } from '@ai-ad-copilot/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toAdChannel, toAdPlanStatus } from '../../common/utils/contract';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdPlanQueryDto } from '../dashboard/dto/ad-plan-query.dto';

const planSelect = {
  planId: true,
  planName: true,
  channel: true,
  status: true,
} satisfies Prisma.AdPlanSelect;

type PlanRow = Prisma.AdPlanGetPayload<{ select: typeof planSelect }>;

/** 下拉选项数据源：只读 AdPlan，不碰 Metric */
@Injectable()
export class AdPlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAdPlans(query: AdPlanQueryDto = {}): Promise<AdPlanOption[]> {
    const rows = await this.prisma.adPlan.findMany({
      where: this.buildWhere(query),
      select: planSelect,
      orderBy: { planId: 'asc' },
    });

    return rows.map((row) => this.toAdPlanOption(row));
  }

  private buildWhere(query: AdPlanQueryDto): Prisma.AdPlanWhereInput {
    const where: Prisma.AdPlanWhereInput = {};

    if (query.channels && query.channels.length > 0) {
      where.channel = { in: [...query.channels] };
    }
    if (query.statuses && query.statuses.length > 0) {
      where.status = { in: [...query.statuses] };
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.planName = { contains: keyword, mode: 'insensitive' };
    }

    return where;
  }

  private toAdPlanOption(row: PlanRow): AdPlanOption {
    const context = `计划 ${row.planId}`;

    return {
      planId: row.planId,
      planName: row.planName,
      channel: toAdChannel(row.channel, context),
      status: toAdPlanStatus(row.status, context),
    };
  }
}
