import { z } from "zod";

// Campaign model per AGENTS.md section 8.

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// Legal status transitions. Terminal states accept no further changes except
// explicit reactivation rules below.
export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isLegalStatusTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_STATUS_TRANSITIONS[from].includes(to);
}

const topicSchema = z.string().min(1).max(500);

export const campaignInputSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(200),
  description: z.string().max(10000).optional(),
  goal: z.string().max(2000).optional(),
  targetAudience: z.string().max(2000).optional(),
  topics: z.array(topicSchema).min(1, "A campaign needs at least one topic"),
});

export const campaignUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(10000).nullable().optional(),
    goal: z.string().max(2000).nullable().optional(),
    targetAudience: z.string().max(2000).nullable().optional(),
    topics: z.array(topicSchema).min(1, "A campaign needs at least one topic").optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Update must contain at least one field",
  });

export const campaignRecordSchema = campaignInputSchema.extend({
  id: z.string(),
  companyId: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type CampaignUpdate = z.infer<typeof campaignUpdateSchema>;
export type CampaignRecord = z.infer<typeof campaignRecordSchema>;
