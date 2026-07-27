-- Help Desk (Knights of the Round Table operator workspace)

CREATE TYPE "HelpTicketChannel" AS ENUM ('TEXT', 'VOICE', 'FEATURE', 'SYSTEM');
CREATE TYPE "HelpTicketStatus" AS ENUM ('OPEN', 'WAITING', 'WITH_KNIGHTS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED');
CREATE TYPE "HelpMessageRole" AS ENUM ('CUSTOMER', 'ADMIN', 'KNIGHT', 'SYSTEM');
CREATE TYPE "HelpVoiceNoteSource" AS ENUM ('UPLOAD', 'DICTATION', 'PASTE');

CREATE TABLE "help_tickets" (
    "id" TEXT NOT NULL,
    "channel" "HelpTicketChannel" NOT NULL DEFAULT 'TEXT',
    "status" "HelpTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "subject" TEXT NOT NULL,
    "clientKey" TEXT,
    "clientId" TEXT,
    "requesterName" TEXT,
    "workRequestId" TEXT,
    "customerQuestionId" TEXT,
    "boardSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "help_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "help_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "role" "HelpMessageRole" NOT NULL,
    "body" TEXT NOT NULL,
    "seat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "help_voice_notes" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "durationSec" INTEGER,
    "source" "HelpVoiceNoteSource" NOT NULL DEFAULT 'PASTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_voice_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "help_tickets_status_updatedAt_idx" ON "help_tickets"("status", "updatedAt");
CREATE INDEX "help_tickets_channel_status_idx" ON "help_tickets"("channel", "status");
CREATE INDEX "help_tickets_clientKey_idx" ON "help_tickets"("clientKey");
CREATE INDEX "help_tickets_customerQuestionId_idx" ON "help_tickets"("customerQuestionId");
CREATE INDEX "help_tickets_workRequestId_idx" ON "help_tickets"("workRequestId");
CREATE INDEX "help_messages_ticketId_createdAt_idx" ON "help_messages"("ticketId", "createdAt");
CREATE INDEX "help_voice_notes_ticketId_createdAt_idx" ON "help_voice_notes"("ticketId", "createdAt");

ALTER TABLE "help_messages" ADD CONSTRAINT "help_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "help_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "help_voice_notes" ADD CONSTRAINT "help_voice_notes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "help_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
