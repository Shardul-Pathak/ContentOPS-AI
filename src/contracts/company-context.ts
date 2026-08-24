import { z } from "zod";

// Mirrors the company context structure defined in AGENTS.md section 7.
// This contract is the single source of truth for what constitutes valid
// company context — persisted facts are authoritative and never inferred.

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  features: z.array(z.string().min(1)).default([]),
  targetUsers: z.array(z.string().min(1)).default([]),
});

export const audienceSchema = z.object({
  primary: z.array(z.string().min(1)).default([]),
  secondary: z.array(z.string().min(1)).default([]),
  painPoints: z.array(z.string().min(1)).default([]),
});

export const brandSchema = z.object({
  voice: z.string().max(2000).optional(),
  tone: z.string().max(2000).optional(),
  styleRules: z.array(z.string().min(1)).default([]),
  prohibitedLanguage: z.array(z.string().min(1)).default([]),
});

export const marketingSchema = z.object({
  goals: z.array(z.string().min(1)).default([]),
  valuePropositions: z.array(z.string().min(1)).default([]),
  ctas: z.array(z.string().min(1)).default([]),
});

export const companyContextInputSchema = z.object({
  name: z.string().min(1, "Company name is required").max(200),
  // nullish(): rows reloaded from the database carry explicit nulls; API
  // payloads may simply omit the fields.
  description: z.string().max(10000).nullish(),
  website: z
    .string()
    .max(500)
    .nullish()
    .refine((v) => v == null || /^https?:\/\/.+/.test(v), {
      message: "Website must be an http(s) URL",
    }),
  industry: z.string().max(200).nullish(),
  products: z.array(productSchema).default([]),
  audience: audienceSchema.default({ primary: [], secondary: [], painPoints: [] }),
  brand: brandSchema.default({ styleRules: [], prohibitedLanguage: [] }),
  marketing: marketingSchema.default({ goals: [], valuePropositions: [], ctas: [] }),
  competitors: z.array(z.string().min(1)).default([]),
  allowedClaims: z.array(z.string().min(1)).default([]),
  prohibitedClaims: z.array(z.string().min(1)).default([]),
  contentTypes: z.array(z.string().min(1)).default([]),
});

export type CompanyContextInput = z.infer<typeof companyContextInputSchema>;

const companyContextUpdateShape = companyContextInputSchema.partial();

export const companyContextUpdateSchema = companyContextUpdateShape.refine(
  (patch) => Object.keys(patch).length > 0,
  { message: "Update must contain at least one field" },
);

export type CompanyContextUpdate = z.infer<typeof companyContextUpdateSchema>;

export const companyRecordSchema = companyContextInputSchema.extend({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CompanyRecord = z.infer<typeof companyRecordSchema>;
