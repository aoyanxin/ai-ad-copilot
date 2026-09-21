-- CreateTable
CREATE TABLE "AdPlan" (
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdPlan_pkey" PRIMARY KEY ("planId")
);

-- CreateTable
CREATE TABLE "Metric" (
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "conversions" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("planId","date")
);

-- CreateIndex
CREATE INDEX "AdPlan_channel_status_idx" ON "AdPlan"("channel", "status");

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AdPlan"("planId") ON DELETE CASCADE ON UPDATE CASCADE;
