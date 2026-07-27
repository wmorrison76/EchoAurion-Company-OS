-- Aurion Knowledge Plane scaffold
CREATE TYPE "VendorAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED');

CREATE TABLE "knowledge_signals" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1',
    "signalType" TEXT NOT NULL,
    "territoryCode" TEXT,
    "aggregationLevel" TEXT NOT NULL DEFAULT 'property',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "sampleSize" INTEGER,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_signals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_insights" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "insightClass" TEXT NOT NULL,
    "aggregationLevel" TEXT NOT NULL DEFAULT 'territory',
    "territoryCode" TEXT,
    "confidence" DOUBLE PRECISION,
    "sampleSize" INTEGER,
    "sourceSeat" TEXT,
    "payload" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_insights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_access_requests" (
    "id" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "useCase" TEXT NOT NULL,
    "scopeNotes" TEXT,
    "status" "VendorAccessStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_signals_signalType_createdAt_idx" ON "knowledge_signals"("signalType", "createdAt");
CREATE INDEX "knowledge_signals_clientKey_createdAt_idx" ON "knowledge_signals"("clientKey", "createdAt");
CREATE INDEX "knowledge_signals_territoryCode_createdAt_idx" ON "knowledge_signals"("territoryCode", "createdAt");
CREATE INDEX "knowledge_insights_insightClass_createdAt_idx" ON "knowledge_insights"("insightClass", "createdAt");
CREATE INDEX "knowledge_insights_published_createdAt_idx" ON "knowledge_insights"("published", "createdAt");
CREATE INDEX "vendor_access_requests_status_createdAt_idx" ON "vendor_access_requests"("status", "createdAt");
