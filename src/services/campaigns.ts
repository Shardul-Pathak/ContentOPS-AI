import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/services/companies";
import {
  campaignInputSchema,
  campaignRecordSchema,
  campaignUpdateSchema,
  isLegalStatusTransition,
  type CampaignInput,
  type CampaignRecord,
  type CampaignStatus,
  type CampaignUpdate,
} from "@/contracts/campaign";

type CampaignDbRow = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  goal: string | null;
  targetAudience: string | null;
  topics: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: CampaignDbRow): CampaignRecord {
  const parsed = campaignRecordSchema.parse({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description ?? undefined,
    goal: row.goal ?? undefined,
    targetAudience: row.targetAudience ?? undefined,
    topics: row.topics ?? [],
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  return parsed;
}

export async function createCampaign(
  companyId: string,
  input: unknown,
): Promise<CampaignRecord> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new NotFoundError("Company not found");

  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid campaign", parsed.error.issues);
  }
  const data = parsed.data as CampaignInput;

  const row = await prisma.campaign.create({
    data: {
      companyId,
      name: data.name,
      description: data.description,
      goal: data.goal,
      targetAudience: data.targetAudience,
      topics: data.topics,
    },
  });
  return toRecord(row);
}

export async function getCampaign(id: string): Promise<CampaignRecord> {
  const row = await prisma.campaign.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Campaign not found");
  return toRecord(row);
}

export async function listCampaigns(companyId?: string): Promise<CampaignRecord[]> {
  const rows = await prisma.campaign.findMany({
    where: companyId ? { companyId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRecord);
}

export async function updateCampaign(
  id: string,
  patch: unknown,
): Promise<CampaignRecord> {
  const existingRow = await prisma.campaign.findUnique({ where: { id } });
  if (!existingRow) throw new NotFoundError("Campaign not found");
  const existing = toRecord(existingRow);

  const parsed = campaignUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    throw new ValidationError("Invalid campaign update", parsed.error.issues);
  }
  const data = parsed.data as CampaignUpdate;

  if (data.status && data.status !== existing.status) {
    const from = existing.status as CampaignStatus;
    if (!isLegalStatusTransition(from, data.status)) {
      throw new ValidationError(`Illegal status transition`, [
        { path: ["status"], message: `Cannot transition from ${from} to ${data.status}` },
      ]);
    }
  }

  // Content edits are locked once a campaign is no longer editable.
  const editable =
    existing.status === "DRAFT" || existing.status === "ACTIVE";
  const contentFields: (keyof CampaignUpdate)[] = [
    "name",
    "description",
    "goal",
    "targetAudience",
    "topics",
  ];
  if (!editable && contentFields.some((f) => data[f] !== undefined)) {
    throw new ValidationError("Campaign is read-only", [
      { path: [], message: `Content cannot be edited while status is ${existing.status}` },
    ]);
  }

  const { status, ...contentPatch } = data;
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contentPatch)) {
    updateData[key] = value === undefined ? undefined : value;
  }
  if (status) updateData.status = status;

  const row = await prisma.campaign.update({ where: { id }, data: updateData });
  return toRecord(row);
}
