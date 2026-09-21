/**
 * seed 写库脚本：只负责把 seed-data 生成的数据落库，不含任何生成逻辑。
 *
 * 运行方式（Prisma CLI 会自动加载 apps/server/.env）：
 *   pnpm.cmd --filter @ai-ad-copilot/server exec prisma db seed
 *
 * 环境守卫见 src/prisma/seed-guard.ts：库名必须以 _test 结尾，或显式 ALLOW_SEED=1。
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { AD_CHANNELS } from '@ai-ad-copilot/shared';

import { dateKeyToUtcDate, getShanghaiTodayKey } from '../src/common/utils/date';
import { assertSeedAllowed } from '../src/prisma/seed-guard';
import {
  SEED_RANGE_DAYS,
  buildSeedDataset,
  type DailyFact,
  type SeedDataset,
} from '../src/modules/dashboard/seed-data';

const BATCH_SIZE = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/** 每个计划最后一条数据的日期，作为 AdPlan.updatedAt */
function resolvePlanUpdatedAt(facts: readonly DailyFact[]): Map<string, Date> {
  const latest = new Map<string, string>();

  facts.forEach((fact) => {
    const current = latest.get(fact.planId);
    if (!current || fact.date > current) {
      latest.set(fact.planId, fact.date);
    }
  });

  return new Map([...latest].map(([planId, date]) => [planId, dateKeyToUtcDate(date)]));
}

function toMetricRows(facts: readonly DailyFact[]): Prisma.MetricCreateManyInput[] {
  return facts.map((fact) => ({
    planId: fact.planId,
    date: dateKeyToUtcDate(fact.date),
    spend: new Prisma.Decimal(fact.spend),
    revenue: new Prisma.Decimal(fact.revenue),
    impressions: fact.impressions,
    clicks: fact.clicks,
    conversions: fact.conversions,
    orders: fact.orders,
  }));
}

export async function writeSeedDataset(
  prisma: PrismaClient,
  dataset: SeedDataset,
): Promise<void> {
  const planUpdatedAt = resolvePlanUpdatedAt(dataset.facts);
  const planRows: Prisma.AdPlanCreateManyInput[] = dataset.plans.map((plan) => ({
    planId: plan.planId,
    planName: plan.planName,
    channel: plan.channel,
    status: plan.status,
    updatedAt: planUpdatedAt.get(plan.planId) ?? new Date(),
  }));

  await prisma.$transaction(
    async (tx) => {
      // 先删 Metric 再删 AdPlan：遵守外键约束
      await tx.metric.deleteMany();
      await tx.adPlan.deleteMany();

      await tx.adPlan.createMany({ data: planRows });
      for (const batch of chunk(toMetricRows(dataset.facts), BATCH_SIZE)) {
        await tx.metric.createMany({ data: batch });
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

async function main(): Promise<void> {
  const databaseName = assertSeedAllowed();
  const todayKey = getShanghaiTodayKey();
  const dataset = buildSeedDataset(todayKey, SEED_RANGE_DAYS);
  const prisma = new PrismaClient();

  try {
    await writeSeedDataset(prisma, dataset);

    const [planCount, metricCount] = await Promise.all([
      prisma.adPlan.count(),
      prisma.metric.count(),
    ]);

    console.log(
      [
        `seed 完成：目标库 ${databaseName}`,
        `区间 ${dataset.range.from} ~ ${dataset.range.to}（${SEED_RANGE_DAYS} 天，Asia/Shanghai 日切）`,
        `渠道 ${AD_CHANNELS.join(' / ')}`,
        `AdPlan ${planCount} 行 / Metric ${metricCount} 行`,
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
