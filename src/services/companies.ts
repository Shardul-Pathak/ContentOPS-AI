import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  companyContextInputSchema,
  companyContextUpdateSchema,
  type CompanyContextInput,
  type CompanyContextUpdate,
  type CompanyRecord,
} from "@/contracts/company-context";

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Company not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

type CompanyDbRow = {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  products: Prisma.JsonValue | null;
  audience: Prisma.JsonValue | null;
  brand: Prisma.JsonValue | null;
  marketing: Prisma.JsonValue | null;
  competitors: Prisma.JsonValue | null;
  allowedClaims: Prisma.JsonValue | null;
  prohibitedClaims: Prisma.JsonValue | null;
  contentTypes: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: CompanyDbRow): CompanyRecord {
  // Rows were validated before persistence; re-parse keeps the record type honest.
  const parsed = companyContextInputSchema.parse({
    name: row.name,
    description: row.description ?? undefined,
    website: row.website ?? undefined,
    industry: row.industry ?? undefined,
    products: row.products ?? [],
    audience: row.audience ?? undefined,
    brand: row.brand ?? undefined,
    marketing: row.marketing ?? undefined,
    competitors: row.competitors ?? [],
    allowedClaims: row.allowedClaims ?? [],
    prohibitedClaims: row.prohibitedClaims ?? [],
    contentTypes: row.contentTypes ?? [],
  });
  return { ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function createCompany(input: unknown): Promise<CompanyRecord> {
  const parsed = companyContextInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid company context", parsed.error.issues);
  }
  const data = parsed.data as CompanyContextInput;
  const row = await prisma.company.create({
    data: {
      name: data.name,
      description: data.description,
      website: data.website,
      industry: data.industry,
      products: data.products,
      audience: data.audience,
      brand: data.brand,
      marketing: data.marketing,
      competitors: data.competitors,
      allowedClaims: data.allowedClaims,
      prohibitedClaims: data.prohibitedClaims,
      contentTypes: data.contentTypes,
    },
  });
  return toRecord(row);
}

export async function getCompany(id: string): Promise<CompanyRecord> {
  const row = await prisma.company.findUnique({ where: { id } });
  if (!row) throw new NotFoundError();
  return toRecord(row);
}

export async function listCompanies(): Promise<CompanyRecord[]> {
  const rows = await prisma.company.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toRecord);
}

const jsonFields = [
  "products",
  "audience",
  "brand",
  "marketing",
  "competitors",
  "allowedClaims",
  "prohibitedClaims",
  "contentTypes",
] as const;

type JsonField = (typeof jsonFields)[number];

export async function updateCompany(
  id: string,
  patch: unknown,
): Promise<CompanyRecord> {
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  const parsed = companyContextUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    throw new ValidationError("Invalid company context update", parsed.error.issues);
  }
  const data = parsed.data as CompanyContextUpdate;

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    updateData[key] = jsonFields.includes(key as JsonField) ? value : value;
  }

  const row = await prisma.company.update({ where: { id }, data: updateData });
  return toRecord(row);
}
