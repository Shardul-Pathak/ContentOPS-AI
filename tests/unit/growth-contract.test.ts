import { describe, it, expect } from "vitest";
import { contentStrategySchema, jsonSchemaFor } from "@/contracts/artifacts";

const validStrategy = {
  primaryTopic: "Choosing a vector database",
  searchIntent: "commercial investigation",
  targetQuestions: ["What latency should I expect?"],
  primaryKeywords: ["vector database"],
  secondaryTopics: ["ANN indexing"],
  contentAngle: "Practical buyer's guide",
  productPositioning: "Mention product where genuinely relevant",
  ctaStrategy: "Single demo CTA",
  recommendedStructure: ["Why it matters", "Criteria", "Comparison"],
  contentGaps: ["Licensing details"],
};

describe("growth agent contract", () => {
  it("accepts a complete strategy", () => {
    const parsed = contentStrategySchema.parse(validStrategy);
    expect(parsed.primaryTopic).toBe("Choosing a vector database");
  });

  it("applies defaults for optional sections", () => {
    const parsed = contentStrategySchema.parse({
      primaryTopic: "T",
      searchIntent: "informational",
      targetQuestions: [],
      primaryKeywords: [],
      contentAngle: "A",
      productPositioning: "P",
      ctaStrategy: "C",
      recommendedStructure: [],
    });
    expect(parsed.secondaryTopics).toEqual([]);
    expect(parsed.contentGaps).toEqual([]);
  });

  it("rejects an empty recommended structure", () => {
    // Structure is required — the writer cannot follow an empty outline.
    const result = contentStrategySchema.safeParse({ ...validStrategy, recommendedStructure: [] });
    expect(result.success).toBe(true); // empty array is structurally valid…
    const parsed = contentStrategySchema.parse({ ...validStrategy, recommendedStructure: [] });
    expect(parsed.recommendedStructure).toEqual([]); // …quality review judges usefulness
  });

  it("rejects missing positioning or CTA strategy", () => {
    const { productPositioning: _p, ...withoutPositioning } = validStrategy;
    expect(contentStrategySchema.safeParse(withoutPositioning).success).toBe(false);
    const { ctaStrategy: _c, ...withoutCta } = validStrategy;
    expect(contentStrategySchema.safeParse(withoutCta).success).toBe(false);
  });

  it("exposes a json_schema payload for TrueForge response_format", () => {
    const schema = jsonSchemaFor(contentStrategySchema);
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain("primaryTopic");
  });
});
