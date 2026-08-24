-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "currentAgent" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "research" JSONB,
    "strategy" JSONB,
    "draft" JSONB,
    "qualityReview" JSONB,
    "assets" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trueforgeSessionId" TEXT,
    "trueforgeTurnId" TEXT,
    "lastSequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "activity" JSONB,
    "output" JSONB,
    "error" TEXT,
    "metrics" JSONB,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "agent_runs_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "contents_campaignId_idx" ON "contents"("campaignId");

-- CreateIndex
CREATE INDEX "agent_runs_contentId_idx" ON "agent_runs"("contentId");
