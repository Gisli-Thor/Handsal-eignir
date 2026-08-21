-- CreateEnum
CREATE TYPE "PortalPublicationStatus" AS ENUM ('NOT_PUBLISHED', 'PUBLISHED', 'NEEDS_UPDATE', 'UNPUBLISHED', 'ERROR');

-- CreateEnum
CREATE TYPE "PortalSyncAction" AS ENUM ('PUBLISH', 'UPDATE', 'UNPUBLISH', 'PULL');

-- CreateEnum
CREATE TYPE "SigningDocType" AS ENUM ('KAUPTILBOD', 'KAUPSAMNINGUR', 'AFSAL', 'UPLOADED_PDF', 'SOLUYFIRLIT_RECEIPT');

-- CreateEnum
CREATE TYPE "SigningRequestStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SigningSignerStatus" AS ENUM ('PENDING', 'SIGNED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ListingDocumentType" ADD VALUE 'UNDIRRITAD';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "soluthoknunText" TEXT;

-- CreateTable
CREATE TABLE "PortalPublication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "portalKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "PortalPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "remoteId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSyncEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "action" "PortalSyncAction" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoluyfirlitVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoluyfirlitVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoluyfirlitSend" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sentById" TEXT,
    "emailMessageId" TEXT,
    "receiptSigningRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoluyfirlitSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docType" "SigningDocType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "status" "SigningRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "providerRequestId" TEXT,
    "signedKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SigningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningSigner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kennitala" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "providerSignerId" TEXT NOT NULL,
    "signerLink" TEXT,
    "status" "SigningSignerStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "SigningSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalPublication_tenantId_status_idx" ON "PortalPublication"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalPublication_listingId_portalKey_key" ON "PortalPublication"("listingId", "portalKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortalPublication_tenantId_id_key" ON "PortalPublication"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PortalSyncEvent_tenantId_publicationId_createdAt_idx" ON "PortalSyncEvent"("tenantId", "publicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SoluyfirlitVersion_listingId_version_key" ON "SoluyfirlitVersion"("listingId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SoluyfirlitVersion_tenantId_id_key" ON "SoluyfirlitVersion"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SoluyfirlitSend_tenantId_versionId_idx" ON "SoluyfirlitSend"("tenantId", "versionId");

-- CreateIndex
CREATE INDEX "SoluyfirlitSend_tenantId_contactId_idx" ON "SoluyfirlitSend"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SigningRequest_providerRequestId_key" ON "SigningRequest"("providerRequestId");

-- CreateIndex
CREATE INDEX "SigningRequest_tenantId_listingId_idx" ON "SigningRequest"("tenantId", "listingId");

-- CreateIndex
CREATE INDEX "SigningRequest_tenantId_status_idx" ON "SigningRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SigningRequest_tenantId_id_key" ON "SigningRequest"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SigningSigner_tenantId_requestId_idx" ON "SigningSigner"("tenantId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SigningSigner_requestId_providerSignerId_key" ON "SigningSigner"("requestId", "providerSignerId");

-- CreateIndex
CREATE INDEX "SigningEvent_tenantId_requestId_createdAt_idx" ON "SigningEvent"("tenantId", "requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "PortalPublication" ADD CONSTRAINT "PortalPublication_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSyncEvent" ADD CONSTRAINT "PortalSyncEvent_tenantId_publicationId_fkey" FOREIGN KEY ("tenantId", "publicationId") REFERENCES "PortalPublication"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoluyfirlitVersion" ADD CONSTRAINT "SoluyfirlitVersion_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoluyfirlitSend" ADD CONSTRAINT "SoluyfirlitSend_tenantId_versionId_fkey" FOREIGN KEY ("tenantId", "versionId") REFERENCES "SoluyfirlitVersion"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoluyfirlitSend" ADD CONSTRAINT "SoluyfirlitSend_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoluyfirlitSend" ADD CONSTRAINT "SoluyfirlitSend_tenantId_receiptSigningRequestId_fkey" FOREIGN KEY ("tenantId", "receiptSigningRequestId") REFERENCES "SigningRequest"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningRequest" ADD CONSTRAINT "SigningRequest_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningSigner" ADD CONSTRAINT "SigningSigner_tenantId_requestId_fkey" FOREIGN KEY ("tenantId", "requestId") REFERENCES "SigningRequest"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEvent" ADD CONSTRAINT "SigningEvent_tenantId_requestId_fkey" FOREIGN KEY ("tenantId", "requestId") REFERENCES "SigningRequest"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
