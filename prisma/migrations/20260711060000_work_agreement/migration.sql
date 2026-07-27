-- Paid-via-profile work agreements (authorize blocked without signature).
CREATE TABLE IF NOT EXISTS "work_agreements" (
    "id" TEXT NOT NULL,
    "workRequestId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerRole" TEXT NOT NULL,
    "typedSignature" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteTotal" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'profile',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_agreements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_agreements_workRequestId_key" ON "work_agreements"("workRequestId");
CREATE INDEX IF NOT EXISTS "work_agreements_signerRole_idx" ON "work_agreements"("signerRole");

ALTER TABLE "work_agreements"
  ADD CONSTRAINT "work_agreements_workRequestId_fkey"
  FOREIGN KEY ("workRequestId") REFERENCES "work_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
