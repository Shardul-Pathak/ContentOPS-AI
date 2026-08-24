-- AlterTable
ALTER TABLE "contents" ADD COLUMN "publishedUrl" TEXT;

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "destination" TEXT NOT NULL,
    "payloadSummary" JSONB NOT NULL,
    "tfSessionId" TEXT,
    "tfTurnId" TEXT,
    "toolCallId" TEXT,
    "threadId" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approvals_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "approvals_contentId_idx" ON "approvals"("contentId");
