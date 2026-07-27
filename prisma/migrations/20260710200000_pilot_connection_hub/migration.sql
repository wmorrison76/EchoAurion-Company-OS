-- Pilot Connection Hub: heartbeat fields, standby flag, outbox, settings

ALTER TABLE "support_clients" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "support_clients" ADD COLUMN IF NOT EXISTS "lastHealth" TEXT;
ALTER TABLE "support_clients" ADD COLUMN IF NOT EXISTS "lastStreamAt" TIMESTAMP(3);

ALTER TABLE "customer_questions" ADD COLUMN IF NOT EXISTS "standbyApproved" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "customer_questions_standbyApproved_answeredAt_idx"
  ON "customer_questions"("standbyApproved", "answeredAt");

CREATE TABLE IF NOT EXISTS "relay_outbox" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "relay_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "relay_outbox_clientKey_deliveredAt_createdAt_idx"
  ON "relay_outbox"("clientKey", "deliveredAt", "createdAt");

CREATE INDEX IF NOT EXISTS "relay_outbox_createdAt_idx"
  ON "relay_outbox"("createdAt");

CREATE TABLE IF NOT EXISTS "standby_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'off',
    "maxAutoPerHour" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "standby_settings_pkey" PRIMARY KEY ("id")
);
