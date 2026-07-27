-- Tenant isolation / handshake Layer 3: request nonce + replay rejection
-- See docs/DATA_ISOLATION_AND_COMPLIANCE.md

CREATE TABLE IF NOT EXISTS "request_nonces" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "clientKey" TEXT,
    "deliveryId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "request_nonces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_nonces_route_nonce_key" ON "request_nonces"("route", "nonce");
CREATE INDEX IF NOT EXISTS "request_nonces_expiresAt_idx" ON "request_nonces"("expiresAt");
CREATE INDEX IF NOT EXISTS "request_nonces_deliveryId_idx" ON "request_nonces"("deliveryId");
CREATE INDEX IF NOT EXISTS "request_nonces_clientKey_createdAt_idx" ON "request_nonces"("clientKey", "createdAt");

-- Help ticket tenant-scoped fingerprint lookups (isolation-friendly)
CREATE INDEX IF NOT EXISTS "help_tickets_fingerprint_clientKey_status_idx"
  ON "help_tickets"("fingerprint", "clientKey", "status");
