-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "ListingContactRole" AS ENUM ('SELLER', 'BUYER', 'PROSPECTIVE_BUYER', 'CO_OWNER');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('FJOLBYLI', 'EINBYLI', 'RADHUS', 'PARHUS', 'HAED', 'ATVINNUHUSNAEDI', 'SUMARHUS', 'LOD', 'ANNAD');

-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('NONE', 'BILSKUR', 'BILSKYLI', 'STAEDI', 'STAEDI_I_BILAHUSI');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('PHOTO', 'FLOOR_PLAN', 'DOCUMENT_SCAN');

-- CreateEnum
CREATE TYPE "ListingDocumentType" AS ENUM ('EIGNASKIPTAYFIRLYSING', 'SKILALYSING', 'VEDBANDAYFIRLIT', 'ANNAD');

-- CreateTable
CREATE TABLE "PostalCode" (
    "code" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,

    CONSTRAINT "PostalCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "kennitala" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'UNDIRBUNINGUR',
    "askingPriceISK" BIGINT,
    "descriptionIs" TEXT,
    "descriptionEn" TEXT,
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAgent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListingAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "ListingContactRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fastanumer" TEXT NOT NULL,
    "landeignarnumer" TEXT,
    "gotuheiti" TEXT NOT NULL,
    "husnumer" TEXT NOT NULL,
    "ibud" TEXT,
    "postnumer" TEXT NOT NULL,
    "tegund" "PropertyType" NOT NULL,
    "birtStaerd" DECIMAL(7,1),
    "tharAfGeymsla" DECIMAL(7,1),
    "herbergi" INTEGER,
    "svefnherbergi" INTEGER,
    "badherbergi" INTEGER,
    "haed" INTEGER,
    "lyfta" BOOLEAN NOT NULL DEFAULT false,
    "parkingType" "ParkingType" NOT NULL DEFAULT 'NONE',
    "parkingCount" INTEGER,
    "byggingarar" INTEGER,
    "fasteignamatISK" BIGINT,
    "brunabotamatISK" BIGINT,
    "athugasemdir" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncumbranceLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "remainingBalanceISK" BIGINT NOT NULL,
    "verdtryggt" BOOLEAN NOT NULL DEFAULT false,
    "interestRatePct" DECIMAL(5,2),
    "yfirtakanlegt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncumbranceLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "category" "MediaCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "webKey" TEXT,
    "thumbKey" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "ListingDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3),
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_tenantId_name_idx" ON "Contact"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_kennitala_key" ON "Contact"("tenantId", "kennitala");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_id_key" ON "Contact"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Listing_tenantId_stage_idx" ON "Listing"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "Listing_tenantId_createdAt_idx" ON "Listing"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_tenantId_id_key" ON "Listing"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ListingAgent_tenantId_userId_idx" ON "ListingAgent"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingAgent_listingId_userId_key" ON "ListingAgent"("listingId", "userId");

-- CreateIndex
CREATE INDEX "ListingContact_tenantId_contactId_idx" ON "ListingContact"("tenantId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingContact_listingId_contactId_role_key" ON "ListingContact"("listingId", "contactId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Property_listingId_key" ON "Property"("listingId");

-- CreateIndex
CREATE INDEX "Property_tenantId_fastanumer_idx" ON "Property"("tenantId", "fastanumer");

-- CreateIndex
CREATE INDEX "Property_tenantId_postnumer_idx" ON "Property"("tenantId", "postnumer");

-- CreateIndex
CREATE UNIQUE INDEX "Property_tenantId_listingId_key" ON "Property"("tenantId", "listingId");

-- CreateIndex
CREATE INDEX "EncumbranceLoan_tenantId_listingId_idx" ON "EncumbranceLoan"("tenantId", "listingId");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_listingId_sortOrder_idx" ON "MediaAsset"("tenantId", "listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "ListingDocument_tenantId_listingId_idx" ON "ListingDocument"("tenantId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAgent" ADD CONSTRAINT "ListingAgent_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAgent" ADD CONSTRAINT "ListingAgent_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingContact" ADD CONSTRAINT "ListingContact_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingContact" ADD CONSTRAINT "ListingContact_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_postnumer_fkey" FOREIGN KEY ("postnumer") REFERENCES "PostalCode"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncumbranceLoan" ADD CONSTRAINT "EncumbranceLoan_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDocument" ADD CONSTRAINT "ListingDocument_tenantId_listingId_fkey" FOREIGN KEY ("tenantId", "listingId") REFERENCES "Listing"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
