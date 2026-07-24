-- Brex financial snapshots + transactions (Mercury migration, 2026-07-24)
CREATE TABLE "brex_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "snappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brex_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brex_snapshots_snappedAt_idx" ON "brex_snapshots"("snappedAt");
CREATE INDEX "brex_snapshots_accountId_snappedAt_idx" ON "brex_snapshots"("accountId", "snappedAt");

CREATE TABLE "brex_transactions" (
    "id" TEXT NOT NULL,
    "brexId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "merchantName" TEXT,
    "description" TEXT,
    "category" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brex_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brex_transactions_brexId_key" ON "brex_transactions"("brexId");
CREATE INDEX "brex_transactions_accountId_postedAt_idx" ON "brex_transactions"("accountId", "postedAt");
CREATE INDEX "brex_transactions_postedAt_idx" ON "brex_transactions"("postedAt");

-- Standard-Webhooks outbound subscriber registry
CREATE TABLE "webhook_subscribers" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_subscribers_active_idx" ON "webhook_subscribers"("active");
