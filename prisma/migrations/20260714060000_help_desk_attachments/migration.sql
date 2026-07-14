-- Help Desk screenshot attachments (pilot → Company OS). DB bytes; ~90d retention.
CREATE TABLE "help_attachments" (
    "id" TEXT NOT NULL,
    "customerQuestionId" TEXT,
    "ticketId" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT,
    "altText" TEXT,
    "byteSize" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "help_attachments_customerQuestionId_idx" ON "help_attachments"("customerQuestionId");
CREATE INDEX "help_attachments_ticketId_idx" ON "help_attachments"("ticketId");
CREATE INDEX "help_attachments_createdAt_idx" ON "help_attachments"("createdAt");

ALTER TABLE "help_attachments" ADD CONSTRAINT "help_attachments_customerQuestionId_fkey" FOREIGN KEY ("customerQuestionId") REFERENCES "customer_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "help_attachments" ADD CONSTRAINT "help_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "help_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
