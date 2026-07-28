-- Product topology snapshots from luccca-web (relay ingest for Fleet Nexus Deployment/Chain scopes).
CREATE TABLE "product_nexus_snapshots" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "appVersion" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_nexus_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_nexus_snapshots_clientKey_createdAt_idx" ON "product_nexus_snapshots"("clientKey", "createdAt" DESC);
