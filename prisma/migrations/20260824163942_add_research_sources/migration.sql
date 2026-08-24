-- CreateTable
CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "claimsSupported" JSONB NOT NULL,
    CONSTRAINT "research_sources_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "research_sources_contentId_idx" ON "research_sources"("contentId");
