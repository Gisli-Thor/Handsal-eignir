-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FyrirvariType" AS ENUM ('FJARMOGNUN', 'SALA_EIGIN_EIGNAR', 'ASTANDSSKODUN', 'SAMTHYKKI_STJORNAR', 'ANNAD');

-- CreateEnum
CREATE TYPE "FyrirvariStatus" AS ENUM ('PENDING', 'FULFILLED', 'WAIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "PartySide" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "ViewingKind" AS ENUM ('SKODUN', 'OPID_HUS');

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "parentId" TEXT,
    "amountISK" BIGINT NOT NULL,
    "afhendingDate" TIMESTAMP(3),
    "gildistimi" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "acceptedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferBuyer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2),

    CONSTRAINT "OfferBuyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPaymentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountISK" BIGINT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "OfferPaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fyrirvari" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "type" "FyrirvariType" NOT NULL,
    "description" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "responsible" "PartySide" NOT NULL,
    "status" "FyrirvariStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "reminder7SentAt" TIMESTAMP(3),
    "reminder2SentAt" TIMESTAMP(3),
    "reminderDueSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fyrirvari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "ViewingKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingAttendee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "viewingId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ViewingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StageTransition_tenantId_listingId_createdAt_idx" ON "StageTransition"("tenantId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_tenantId_listingId_createdAt_idx" ON "Offer"("tenantId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_tenantId_status_gildistimi_idx" ON "Offer"("tenantId", "status", "gildistimi");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_tenantId_id_key" ON "Offer"("tenantId", "id");

-- CreateIndex
CREATE INDEX "OfferBuyer_tenantId_contactId_idx" ON "OfferBuyer"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferBuyer_offerId_contactId_key" ON "OfferBuyer"("offerId", "contactId");

-- CreateIndex
CREATE INDEX "OfferPaymentItem_tenantId_offerId_sortOrder_idx" ON "OfferPaymentItem"("tenantId", "offerId", "sortOrder");

-- CreateIndex
CREATE INDEX "Fyrirvari_tenantId_status_deadline_idx" ON "Fyrirvari"("tenantId", "status", "deadline");

-- CreateIndex
CREATE INDEX "Viewing_tenantId_startsAt_idx" ON "Viewing"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "Viewing_tenantId_listingId_idx" ON "Viewing"("tenantId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Viewing_tenantId_id_key" ON "Viewing"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ViewingAttendee_tenantId_contactId_idx" ON "ViewingAttendee"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingAttendee_viewingId_contactId_key" ON "ViewingAttendee"("viewingId", "contactId");

-- CreateIndex
CREATE INDEX "ListingNote_tenantId_listingId_createdAt_idx" ON "ListingNote"("tenantId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingTask_tenantId_listingId_idx" ON "ListingTask"("tenantId", "listingId");

-- CreateIndex
CREATE INDEX "ListingTask_tenantId_assigneeUserId_completedAt_idx" ON "ListingTask"("tenantId", "assigneeUserId", "completedAt");

-- CreateIndex
CREATE INDEX "ListingTask_tenantId_completedAt_dueDate_idx" ON "ListingTask"("tenantId", "completedAt", "dueDate");

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_parentId_fkey" FOREIGN KEY ("tenantId", "parentId") REFERENCES "Offer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferBuyer" ADD CONSTRAINT "OfferBuyer_tenantId_offerId_fkey" FOREIGN KEY ("tenantId", "offerId") REFERENCES "Offer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferBuyer" ADD CONSTRAINT "OfferBuyer_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPaymentItem" ADD CONSTRAINT "OfferPaymentItem_tenantId_offerId_fkey" FOREIGN KEY ("tenantId", "offerId") REFERENCES "Offer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fyrirvari" ADD CONSTRAINT "Fyrirvari_tenantId_offerId_fkey" FOREIGN KEY ("tenantId", "offerId") REFERENCES "Offer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingAttendee" ADD CONSTRAINT "ViewingAttendee_tenantId_viewingId_fkey" FOREIGN KEY ("tenantId", "viewingId") REFERENCES "Viewing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingAttendee" ADD CONSTRAINT "ViewingAttendee_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingNote" ADD CONSTRAINT "ListingNote_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingTask" ADD CONSTRAINT "ListingTask_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingTask" ADD CONSTRAINT "ListingTask_tenantId_assigneeUserId_fkey" FOREIGN KEY ("tenantId", "assigneeUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
