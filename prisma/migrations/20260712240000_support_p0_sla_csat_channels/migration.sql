-- Support P0: SLA clocks, CSAT, email/SMS channels, Help Center flags, invoice hooks
-- See docs/SUPPORT_90_DAY_PLAN.md

-- IntakeChannel: add EMAIL + SMS
ALTER TYPE "IntakeChannel" ADD VALUE IF NOT EXISTS 'EMAIL';
ALTER TYPE "IntakeChannel" ADD VALUE IF NOT EXISTS 'SMS';

-- HelpTicket SLA + CSAT
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "firstResponseDueAt" TIMESTAMP(3);
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "resolveDueAt" TIMESTAMP(3);
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "slaBreachedAt" TIMESTAMP(3);
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "slaEscalatedAt" TIMESTAMP(3);
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "csatScore" INTEGER;
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "csatComment" TEXT;
ALTER TABLE "help_tickets" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

CREATE INDEX IF NOT EXISTS "help_tickets_firstResponseDueAt_idx" ON "help_tickets"("firstResponseDueAt");
CREATE INDEX IF NOT EXISTS "help_tickets_resolveDueAt_idx" ON "help_tickets"("resolveDueAt");
CREATE INDEX IF NOT EXISTS "help_tickets_slaBreachedAt_idx" ON "help_tickets"("slaBreachedAt");

-- HelpArticle public + macro flags
ALTER TABLE "help_articles" ADD COLUMN IF NOT EXISTS "public" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "help_articles" ADD COLUMN IF NOT EXISTS "isMacro" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "help_articles_public_updatedAt_idx" ON "help_articles"("public", "updatedAt");
CREATE INDEX IF NOT EXISTS "help_articles_isMacro_updatedAt_idx" ON "help_articles"("isMacro", "updatedAt");

-- WorkAgreement Stripe invoice hooks
ALTER TABLE "work_agreements" ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT;
ALTER TABLE "work_agreements" ADD COLUMN IF NOT EXISTS "stripeInvoiceUrl" TEXT;
ALTER TABLE "work_agreements" ADD COLUMN IF NOT EXISTS "invoiceStatus" TEXT;
CREATE INDEX IF NOT EXISTS "work_agreements_stripeInvoiceId_idx" ON "work_agreements"("stripeInvoiceId");
