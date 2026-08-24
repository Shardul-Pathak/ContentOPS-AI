import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { parseLooseJson } from "@/lib/json-extract";

// Agent output contracts per AGENTS.md sections 10-15. Every agent's final
// answer must parse against its schema before anything is persisted or passed
// to the next stage (structured handoffs, section 4.5).

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),
  relevance: z.string().min(1),
  claimsSupported: z.array(z.string().min(1)).default([]),
});

export const researchResultSchema = z.object({
  topic: z.string().min(1),
  searchIntent: z.string().min(1),
  audienceQuestions: z.array(z.string().min(1)),
  painPoints: z.array(z.string().min(1)),
  keyPoints: z.array(z.string().min(1)),
  sources: z.array(sourceSchema).default([]),
  contentOpportunities: z.array(z.string().min(1)).default([]),
  limitations: z.array(z.string().min(1)).default([]),
});

export const contentStrategySchema = z.object({
  primaryTopic: z.string().min(1),
  searchIntent: z.string().min(1),
  targetQuestions: z.array(z.string().min(1)),
  primaryKeywords: z.array(z.string().min(1)),
  secondaryTopics: z.array(z.string().min(1)).default([]),
  contentAngle: z.string().min(1),
  productPositioning: z.string().min(1),
  ctaStrategy: z.string().min(1),
  recommendedStructure: z.array(z.string().min(1)),
  contentGaps: z.array(z.string().min(1)).default([]),
});

export const articleDraftSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be kebab-case"),
  metaTitle: z.string().min(1),
  metaDescription: z.string().min(1),
  content: z.string().min(200, "article body is too short to be a real article"),
  headings: z.array(z.string().min(1)),
  cta: z.string().min(1),
  sources: z.array(sourceSchema).default([]),
});

export const qualityIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum(["seo", "content_quality", "brand_compliance"]),
  description: z.string().min(1),
  location: z.string().min(1),
  suggestedFix: z.string().min(1),
});

export const qualityReviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("PASS"),
    score: z.number().min(0).max(100),
    issues: z.tuple([]).optional(),
    recommendations: z.array(z.string().min(1)).default([]),
  }),
  z.object({
    status: z.literal("FAIL"),
    score: z.number().min(0).max(100),
    issues: z.array(qualityIssueSchema).min(1, "FAIL reviews require at least one issue"),
    recommendations: z.array(z.string().min(1)).default([]),
  }),
]);

export const assetSchema = z.object({
  type: z.enum(["hero", "inline"]),
  url: z.string().url(),
  altText: z.string().min(1),
  description: z.string().min(1),
});

export const assetSetSchema = z.object({
  assets: z.array(assetSchema).min(1, "at least a hero asset is required"),
});

// Wire format for the quality agent's response_format: OpenAI-compatible
// providers reject root-level unions ("anyOf" at the schema root), so the
// verdict travels inside a single-object envelope. App-side validation still
// accepts both this envelope and the bare PASS/FAIL object.
export const qualityReviewResponseSchema = z.object({
  review: qualityReviewSchema,
});

// What the publishing agent proposes to send where — frozen into the Approval
// record the human reviews (AGENTS.md section 17 preview fields).
export const publishPayloadSchema = z.object({
  destination: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  metaDescription: z.string().min(1),
  assetCount: z.number().int().nonnegative(),
  externalAction: z.string().min(1),
});

export const publishResultSchema = z.object({
  publishedUrl: z.string().url(),
  externalId: z.string().optional(),
});

export type Source = z.infer<typeof sourceSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type ContentStrategy = z.infer<typeof contentStrategySchema>;
export type ArticleDraft = z.infer<typeof articleDraftSchema>;
export type QualityReview = z.infer<typeof qualityReviewSchema>;
export type AssetSet = z.infer<typeof assetSetSchema>;

/**
 * Parses the quality agent's text output. Accepts the enveloped wire format
 * ({ "review": {...} }) required by OpenAI-compatible providers as well as
 * the bare PASS/FAIL object used by fixtures and older runs.
 */
export function parseQualityReviewOutput(text: string): QualityReview | null {
  const json = parseLooseJson(text);
  if (json == null || typeof json !== "object") return null;
  const candidate =
    "review" in json ? (json as { review: unknown }).review : json;
  const parsed = qualityReviewSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
export type PublishPayload = z.infer<typeof publishPayloadSchema>;
export type PublishResult = z.infer<typeof publishResultSchema>;

// --- JSON Schema generation for TrueForge response_format -------------------
// Note: discriminated unions in the quality review produce anyOf schemas;
// providers with weak json_schema support fall back via RESPONSE_FORMAT_MODE.

type SchemaFor =
  | typeof researchResultSchema
  | typeof contentStrategySchema
  | typeof articleDraftSchema
  | typeof qualityReviewResponseSchema
  | typeof assetSetSchema
  | typeof publishPayloadSchema;

export function jsonSchemaFor(schema: SchemaFor): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: "openAi" }) as Record<string, unknown>;
}
