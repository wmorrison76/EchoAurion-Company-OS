-- SystemSnapshot: anonymized operator health captures (no PII)
CREATE TABLE IF NOT EXISTS "system_snapshots" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'operator',
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "payload" JSONB NOT NULL,
    "sentToKnights" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_snapshots_createdAt_idx" ON "system_snapshots"("createdAt");
