-- Scale queue + Echo learning plane + fingerprint index for 5k-tenant bursts.
-- See docs/SCALE_AND_THROTTLE.md, docs/ECHO_LEARNING_PLANE.md

CREATE TABLE IF NOT EXISTS "ingest_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ingest_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ingest_jobs_status_runAfter_idx" ON "ingest_jobs"("status", "runAfter");
CREATE INDEX IF NOT EXISTS "ingest_jobs_kind_status_idx" ON "ingest_jobs"("kind", "status");
CREATE INDEX IF NOT EXISTS "ingest_jobs_dedupeKey_status_idx" ON "ingest_jobs"("dedupeKey", "status");

CREATE TABLE IF NOT EXISTS "echo_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "domain" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "contentRedacted" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" JSONB,
    "productLine" TEXT,
    "clientKey" TEXT,
    "shareScope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "echo_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "echo_knowledge_chunks_section_createdAt_idx" ON "echo_knowledge_chunks"("section", "createdAt");
CREATE INDEX IF NOT EXISTS "echo_knowledge_chunks_sourceType_sourceRef_idx" ON "echo_knowledge_chunks"("sourceType", "sourceRef");
CREATE INDEX IF NOT EXISTS "echo_knowledge_chunks_productLine_shareScope_idx" ON "echo_knowledge_chunks"("productLine", "shareScope");
CREATE INDEX IF NOT EXISTS "echo_knowledge_chunks_clientKey_createdAt_idx" ON "echo_knowledge_chunks"("clientKey", "createdAt");
CREATE INDEX IF NOT EXISTS "echo_knowledge_chunks_shareScope_updatedAt_idx" ON "echo_knowledge_chunks"("shareScope", "updatedAt");

-- Faster fingerprint dedupe under stampede (open tickets by fp + recency).
CREATE INDEX IF NOT EXISTS "help_tickets_fingerprint_lastOccurredAt_idx" ON "help_tickets"("fingerprint", "lastOccurredAt");
CREATE INDEX IF NOT EXISTS "error_patterns_fingerprint_lastSeenAt_idx" ON "error_patterns"("fingerprint", "lastSeenAt");
