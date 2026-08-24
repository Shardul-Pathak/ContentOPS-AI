-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "products" JSONB,
    "audience" JSONB,
    "brand" JSONB,
    "marketing" JSONB,
    "competitors" JSONB,
    "allowedClaims" JSONB,
    "prohibitedClaims" JSONB,
    "contentTypes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
