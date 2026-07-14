-- Timed Help Desk auto-send permit (unlock dual-control for a window)
ALTER TABLE "standby_settings" ADD COLUMN IF NOT EXISTS "helpDeskAutoSendEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "standby_settings" ADD COLUMN IF NOT EXISTS "helpDeskAutoSendUntil" TIMESTAMP(3);
