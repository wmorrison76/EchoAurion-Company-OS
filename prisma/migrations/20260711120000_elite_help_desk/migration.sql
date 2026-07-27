-- Elite Help Desk: timeline, eval harness, break-glass scaffold
-- See docs/ELITE_DR_OS.md

CREATE TABLE IF NOT EXISTS "help_timeline_events" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'william_morrison',
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "help_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "help_timeline_events_ticketId_createdAt_idx"
  ON "help_timeline_events"("ticketId", "createdAt");

ALTER TABLE "help_timeline_events"
  DROP CONSTRAINT IF EXISTS "help_timeline_events_ticketId_fkey";
ALTER TABLE "help_timeline_events"
  ADD CONSTRAINT "help_timeline_events_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "help_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "help_eval_cases" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "expectedChannel" TEXT NOT NULL,
    "mustInclude" TEXT[],
    "mustNotInclude" TEXT[],
    "expectedRecommendation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "help_eval_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "help_eval_runs" (
    "id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "withDrafts" BOOLEAN NOT NULL DEFAULT false,
    "results" JSONB NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'william_morrison',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "help_eval_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "help_eval_runs_createdAt_idx" ON "help_eval_runs"("createdAt");

CREATE TABLE IF NOT EXISTS "break_glass_sessions" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "break_glass_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "break_glass_sessions_clientKey_status_idx"
  ON "break_glass_sessions"("clientKey", "status");
CREATE INDEX IF NOT EXISTS "break_glass_sessions_expiresAt_idx"
  ON "break_glass_sessions"("expiresAt");
