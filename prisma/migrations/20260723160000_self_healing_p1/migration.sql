-- Idempotent version (repaired 2026-07-24): original run crashed midway.
-- We wrap every DDL in a DO block or IF NOT EXISTS so re-application is safe.

-- Fix truth-telling: deployed-SHA receipt on tickets (TICKET_VS_CODE_FIX_AUDIT P1/P2)
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "productFixDeployed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "fixedInSha" TEXT;

-- SLA breach scan (OR across the three due/breach clocks) — bitmap-or friendly
CREATE INDEX IF NOT EXISTS "help_tickets_slaBreachedAt_idx" ON "help_tickets"("slaBreachedAt");
CREATE INDEX IF NOT EXISTS "help_tickets_firstResponseDueAt_idx" ON "help_tickets"("firstResponseDueAt");
CREATE INDEX IF NOT EXISTS "help_tickets_resolveDueAt_idx" ON "help_tickets"("resolveDueAt");

-- Real AI token metering (per provider/model/tenant)
CREATE TABLE IF NOT EXISTS "ai_usage_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientKey" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feature" TEXT,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_usage_events_createdAt_idx" ON "ai_usage_events"("createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_events_clientKey_createdAt_idx" ON "ai_usage_events"("clientKey", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_events_provider_model_createdAt_idx" ON "ai_usage_events"("provider", "model", "createdAt");
