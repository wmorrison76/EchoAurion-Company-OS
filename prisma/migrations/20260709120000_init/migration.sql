-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('SENT', 'OPENED', 'RESPONDED', 'BOUNCED', 'NO_REPLY');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('IDENTIFIED', 'CONTACTED', 'RESPONDED', 'MEETING', 'ACTIVE', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "BoardRoomStatus" AS ENUM ('DISPATCHING', 'SYNTHESIZING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "KnightResponseStatus" AS ENUM ('PENDING', 'RESPONDED', 'UNAVAILABLE', 'TIMEOUT', 'ERROR');

-- CreateEnum
CREATE TYPE "BoardActionType" AS ENUM ('TICKET', 'EMAIL', 'CALENDAR', 'NOTE');

-- CreateEnum
CREATE TYPE "BoardActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SupportSessionStatus" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('NEW', 'DRAFTED', 'ANSWERED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WorkKind" AS ENUM ('FIX', 'ADDON');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('RECEIVED', 'QUOTED', 'AUTHORIZED', 'IN_PROGRESS', 'EXECUTED', 'ROLLED_BACK', 'DECLINED');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plaid_items" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plaid_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plaid_accounts" (
    "id" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "mask" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plaid_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "available" DOUBLE PRECISION,
    "current" DOUBLE PRECISION NOT NULL,
    "limit" DOUBLE PRECISION,
    "snappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "category" TEXT[],
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercury_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "snappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercury_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "health" TEXT NOT NULL,
    "lastContact" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "linkedIn" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'SENT',
    "responseAt" TIMESTAMP(3),
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "stage" "DealStage" NOT NULL DEFAULT 'IDENTIFIED',
    "notes" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrr_snapshots" (
    "id" TEXT NOT NULL,
    "mrr" DOUBLE PRECISION NOT NULL,
    "customerCount" INTEGER NOT NULL,
    "newMRR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "churnedMRR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expansionMRR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrr_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raise_config" (
    "id" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 500000,
    "committed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raise_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_room_sessions" (
    "id" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "status" "BoardRoomStatus" NOT NULL DEFAULT 'DISPATCHING',
    "synthesis" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knight_responses" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seat" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "KnightResponseStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT,
    "error" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knight_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "BoardActionType" NOT NULL,
    "status" "BoardActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_briefings" (
    "id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "headline" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_clients" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "property" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_snapshots" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appVersion" TEXT,
    "platform" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "queueDepth" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "topic" TEXT NOT NULL,
    "status" "SupportSessionStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "actor" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_questions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientKey" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "context" JSONB,
    "status" "QuestionStatus" NOT NULL DEFAULT 'NEW',
    "draftSeat" TEXT,
    "draftAnswer" TEXT,
    "answer" TEXT,
    "directive" JSONB,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "customer_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityRef" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientKey" TEXT NOT NULL,
    "kind" "WorkKind" NOT NULL DEFAULT 'FIX',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "context" JSONB,
    "requesterName" TEXT,
    "requesterRole" TEXT,
    "tier" TEXT,
    "humanHours" DOUBLE PRECISION,
    "quoteTotal" DOUBLE PRECISION,
    "quoteSnapshot" JSONB,
    "draftSeat" TEXT,
    "draftPlan" TEXT,
    "approvedByCustomer" BOOLEAN NOT NULL DEFAULT false,
    "customerApprover" TEXT,
    "approvedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "rollbackRef" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkStatus" NOT NULL DEFAULT 'RECEIVED',
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quotedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "work_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_contacts" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_actor_idx" ON "audit_log"("actor");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "plaid_items_itemId_key" ON "plaid_items"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "plaid_accounts_plaidAccountId_key" ON "plaid_accounts"("plaidAccountId");

-- CreateIndex
CREATE INDEX "balance_snapshots_accountId_snappedAt_idx" ON "balance_snapshots"("accountId", "snappedAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_plaidTransactionId_key" ON "transactions"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "mercury_snapshots_snappedAt_idx" ON "mercury_snapshots"("snappedAt");

-- CreateIndex
CREATE INDEX "outreach_contactId_idx" ON "outreach"("contactId");

-- CreateIndex
CREATE INDEX "deals_stage_idx" ON "deals"("stage");

-- CreateIndex
CREATE INDEX "mrr_snapshots_snappedAt_idx" ON "mrr_snapshots"("snappedAt");

-- CreateIndex
CREATE INDEX "board_room_sessions_createdAt_idx" ON "board_room_sessions"("createdAt");

-- CreateIndex
CREATE INDEX "knight_responses_sessionId_idx" ON "knight_responses"("sessionId");

-- CreateIndex
CREATE INDEX "board_actions_sessionId_idx" ON "board_actions"("sessionId");

-- CreateIndex
CREATE INDEX "board_actions_status_idx" ON "board_actions"("status");

-- CreateIndex
CREATE INDEX "board_briefings_createdAt_idx" ON "board_briefings"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_clients_clientKey_key" ON "support_clients"("clientKey");

-- CreateIndex
CREATE INDEX "diagnostic_snapshots_clientId_createdAt_idx" ON "diagnostic_snapshots"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "support_sessions_status_idx" ON "support_sessions"("status");

-- CreateIndex
CREATE INDEX "customer_questions_status_idx" ON "customer_questions"("status");

-- CreateIndex
CREATE INDEX "customer_questions_clientKey_delivered_idx" ON "customer_questions"("clientKey", "delivered");

-- CreateIndex
CREATE INDEX "alerts_read_createdAt_idx" ON "alerts"("read", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "work_requests_status_idx" ON "work_requests"("status");

-- CreateIndex
CREATE INDEX "work_requests_clientKey_delivered_idx" ON "work_requests"("clientKey", "delivered");

-- CreateIndex
CREATE UNIQUE INDEX "billing_contacts_token_key" ON "billing_contacts"("token");

-- CreateIndex
CREATE INDEX "billing_contacts_clientKey_idx" ON "billing_contacts"("clientKey");

-- AddForeignKey
ALTER TABLE "plaid_accounts" ADD CONSTRAINT "plaid_accounts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "plaid_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "plaid_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "plaid_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knight_responses" ADD CONSTRAINT "knight_responses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "board_room_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_snapshots" ADD CONSTRAINT "diagnostic_snapshots_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "support_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "support_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

