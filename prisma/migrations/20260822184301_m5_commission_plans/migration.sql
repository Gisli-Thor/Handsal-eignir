-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "commissionSchemeOverride" JSONB;

-- AlterTable
ALTER TABLE "ListingAgent" ADD COLUMN     "splitPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "commissionScheme" JSONB,
ADD COLUMN     "usageWarnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "salePriceISK" BIGINT NOT NULL,
    "scheme" JSONB NOT NULL,
    "grossISK" BIGINT NOT NULL,
    "vskISK" BIGINT NOT NULL,
    "totalISK" BIGINT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "agentSplits" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_listingId_key" ON "CommissionRecord"("listingId");

-- CreateIndex
CREATE INDEX "CommissionRecord_tenantId_createdAt_idx" ON "CommissionRecord"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRecord_tenantId_listingId_key" ON "CommissionRecord"("tenantId", "listingId");

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
