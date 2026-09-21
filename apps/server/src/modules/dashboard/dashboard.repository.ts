import type { AdChannel, AdPlanStatus } from '@ai-ad-copilot/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { dateKeyToUtcDate, utcDateToDateKey } from '../../common/utils/date';
import { toAdChannel, toAdPlanStatus } from '../../common/utils/contract';
import { PrismaService } from '../../prisma/prisma.service';
import type { DailyFact } from './seed-data';

/** 明细表的计划级筛选项（对应 Day2 mock 里的 statuses / keyword 列筛选） */
export interface PlanRecordFilters {
  planId?: string;
  channels?: AdChannel[];
  statuses?: AdPlanStatus[];
  keyword?: string;
}

const metricSelect = {
  planId: true,
  date: true,
  spend: true,
  revenue: true,
  impressions: true,
  clicks: true,
  conversions: true,
  orders: true,
  plan: { select: { planName: true, channel: true, status: true } },
} satisfies Prisma.MetricSelect;

type MetricRow = Prisma.MetricGetPayload<{ select: typeof metricSelect }>;

/**
 * 唯一把 Prisma 类型转成引擎契约的边界：
 * - @db.Decimal 金额在这里 .toNumber()，出了这个文件只有 number
 * - @db.Date 用 utcDateToDateKey 转成 YYYY-MM-DD 字符串
 * - 只做过滤 / JOIN，不做任何聚合（聚合全部在 query-engine）
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 概览 / 趋势 / 渠道 / 漏斗用：只要区间，渠道与计划在内存里过滤 */
  async findAllFacts(from: string, to: string): Promise<DailyFact[]> {
    return this.findFacts(from, to);
  }

  /** 明细表用：把计划级筛选下推到 SQL，减少传输行数 */
  async findPlanRecords(
    from: string,
    to: string,
    filters: PlanRecordFilters = {},
  ): Promise<DailyFact[]> {
    return this.findFacts(from, to, filters);
  }

  private async findFacts(
    from: string,
    to: string,
    filters: PlanRecordFilters = {},
  ): Promise<DailyFact[]> {
    const rows = await this.prisma.metric.findMany({
      where: {
        date: { gte: dateKeyToUtcDate(from), lte: dateKeyToUtcDate(to) },
        ...(this.buildPlanFilter(filters) ?? {}),
      },
      select: metricSelect,
      orderBy: [{ date: 'asc' }, { planId: 'asc' }],
    });

    return rows.map((row) => this.toDailyFact(row));
  }

  private buildPlanFilter(filters: PlanRecordFilters): { plan?: Prisma.AdPlanWhereInput } | null {
    const plan: Prisma.AdPlanWhereInput = {};

    if (filters.planId) {
      plan.planId = filters.planId;
    }
    if (filters.channels && filters.channels.length > 0) {
      plan.channel = { in: [...filters.channels] };
    }
    if (filters.statuses && filters.statuses.length > 0) {
      plan.status = { in: [...filters.statuses] };
    }
    const keyword = filters.keyword?.trim();
    if (keyword) {
      plan.planName = { contains: keyword, mode: 'insensitive' };
    }

    return Object.keys(plan).length > 0 ? { plan } : null;
  }

  private toDailyFact(row: MetricRow): DailyFact {
    const context = `计划 ${row.planId}`;

    return {
      date: utcDateToDateKey(row.date),
      planId: row.planId,
      planName: row.plan.planName,
      channel: toAdChannel(row.plan.channel, context),
      status: toAdPlanStatus(row.plan.status, context),
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      orders: row.orders,
      spend: row.spend.toNumber(),
      revenue: row.revenue.toNumber(),
    };
  }
}
