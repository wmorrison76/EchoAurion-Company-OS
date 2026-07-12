-- Knights continuous-improvement flywheel: COHORT scope, canary, runbooks, eval.

ALTER TYPE "ErrorBlastScope" ADD VALUE IF NOT EXISTS 'COHORT';

ALTER TABLE "help_tickets"
  ADD COLUMN IF NOT EXISTS "cohortBrowser" TEXT,
  ADD COLUMN IF NOT EXISTS "cohortOs" TEXT,
  ADD COLUMN IF NOT EXISTS "cohortAppVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "rolloutStage" TEXT,
  ADD COLUMN IF NOT EXISTS "canaryClientKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "agentWorking" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "maintenance_notices"
  ADD COLUMN IF NOT EXISTS "canaryClientKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "knight_runbooks" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "productLine" TEXT NOT NULL,
  "errorCategory" "ErrorCategory",
  "title" TEXT NOT NULL,
  "resolutionSteps" TEXT NOT NULL,
  "denyIfCore" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "confirmedBy" TEXT,
  "evalScore" DOUBLE PRECISION,
  "sourceTicketId" TEXT,
  "hitCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knight_runbooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "knight_runbooks_fingerprint_productLine_key"
  ON "knight_runbooks"("fingerprint", "productLine");

CREATE INDEX IF NOT EXISTS "knight_runbooks_status_hitCount_idx"
  ON "knight_runbooks"("status", "hitCount");

CREATE INDEX IF NOT EXISTS "knight_runbooks_errorCategory_productLine_idx"
  ON "knight_runbooks"("errorCategory", "productLine");

CREATE TABLE IF NOT EXISTS "knight_evals" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "fingerprint" TEXT,
  "productLine" TEXT,
  "draftText" TEXT NOT NULL,
  "finalFixText" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "matched" BOOLEAN NOT NULL DEFAULT false,
  "actor" TEXT NOT NULL DEFAULT 'computer_agent',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knight_evals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "knight_evals_ticketId_idx" ON "knight_evals"("ticketId");
CREATE INDEX IF NOT EXISTS "knight_evals_createdAt_idx" ON "knight_evals"("createdAt");
CREATE INDEX IF NOT EXISTS "knight_evals_matched_score_idx" ON "knight_evals"("matched", "score");
