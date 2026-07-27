-- Support roadmap frameworks: intake gates, channels, per-tenant secret hash, cost snapshots

CREATE TYPE "IntakeGate" AS ENUM ('TECH', 'BILLING', 'BUILD', 'OTHER');
CREATE TYPE "IntakeChannel" AS ENUM ('IN_APP', 'VOICE', 'PHONE_IVR');

ALTER TABLE "support_clients" ADD COLUMN IF NOT EXISTS "ingestSecretHash" TEXT;

ALTER TABLE "customer_questions" ADD COLUMN IF NOT EXISTS "intakeGate" "IntakeGate";

ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "intakeGate" "IntakeGate";
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "intakeChannel" "IntakeChannel" NOT NULL DEFAULT 'IN_APP';

CREATE INDEX IF NOT EXISTS "help_tickets_intakeGate_status_idx" ON "help_tickets"("intakeGate", "status");
CREATE INDEX IF NOT EXISTS "help_tickets_intakeChannel_status_idx" ON "help_tickets"("intakeChannel", "status");

CREATE TABLE IF NOT EXISTS "customer_cost_snapshots" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "clientId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "estimatedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "knightSeatHits" JSONB,
    "workSpendUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productLine" TEXT,
    "source" TEXT NOT NULL DEFAULT 'aggregate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_cost_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_cost_snapshots_clientKey_periodStart_idx"
  ON "customer_cost_snapshots"("clientKey", "periodStart");
CREATE INDEX IF NOT EXISTS "customer_cost_snapshots_periodStart_periodEnd_idx"
  ON "customer_cost_snapshots"("periodStart", "periodEnd");

DO $$ BEGIN
  ALTER TABLE "customer_cost_snapshots"
    ADD CONSTRAINT "customer_cost_snapshots_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "support_clients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
