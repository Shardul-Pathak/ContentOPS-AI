/*
  Warnings:

  - You are about to drop the column `assets` on the `contents` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "assets_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contents" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contents" ("campaignId", "createdAt", "currentAgent", "draft", "failureReason", "id", "qualityReview", "research", "revisionCount", "status", "strategy", "topic", "updatedAt") SELECT "campaignId", "createdAt", "currentAgent", "draft", "failureReason", "id", "qualityReview", "research", "revisionCount", "status", "strategy", "topic", "updatedAt" FROM "contents";
DROP TABLE "contents";
ALTER TABLE "new_contents" RENAME TO "contents";
CREATE INDEX "contents_campaignId_idx" ON "contents"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "assets_contentId_idx" ON "assets"("contentId");
