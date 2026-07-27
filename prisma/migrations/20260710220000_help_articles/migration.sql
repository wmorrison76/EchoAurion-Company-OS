-- Help File / Knowledge Base articles for Knights cite + operator send-to-client
CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "panelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");
CREATE INDEX "help_articles_updatedAt_idx" ON "help_articles"("updatedAt");
