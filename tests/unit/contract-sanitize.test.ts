import { describe, it, expect } from "vitest";
import { sanitizeFor } from "@/lib/contract-sanitize";
import { parseQualityReviewOutput, researchResultSchema } from "@/contracts/artifacts";

// The exact failure observed live with minimax/minimax-m3:free: painPoints
// arrived as objects instead of plain strings.
const minimaxStyleResearch = {
  topic: "AI infrastructure cost optimization",
  searchIntent: "Research strategies and market context for a Credex blog article.",
  audienceQuestions: [
    "How much are startups overspending on unused AI credits?",
    "What percentage of AI budget is wasted?",
  ],
  painPoints: [
    { point: "Unpredictable API bills", detail: "costs spike with usage" },
    { text: "Monitoring across many dashboards" },
    { description: "Over-purchasing credits ahead of need" },
  ],
  keyPoints: [{ statement: "Idle credits are measurable waste" }],
  sources: [
    {
      title: "AWS RI Marketplace",
      url: "aws.amazon.com/ec2/ri/marketplace/", // no scheme — must be fixed
      relevance: "Shows functioning secondary market",
      claimsSupported: ["Listings average 5-12% off"],
    },
    "https://www.crn.com/news/cloud/secondary-market", // bare URL string
  ],
};

describe("output normalization (formatting-level)", () => {
  it("coerces objectified painPoints/keyPoints into strings", () => {
    const out = sanitizeFor("research", minimaxStyleResearch) as {
      painPoints?: string[];
      keyPoints?: string[];
    };
    expect(out.painPoints).toEqual([
      "Unpredictable API bills",
      "Monitoring across many dashboards",
      "Over-purchasing credits ahead of need",
    ]);
    expect(out.keyPoints).toEqual(["Idle credits are measurable waste"]);
    // And the full contract now validates.
    expect(researchResultSchema.safeParse(out).success).toBe(true);
  });

  it("prepends missing URL schemes and derives publisher from the host", () => {
    const out = sanitizeFor("research", minimaxStyleResearch) as {
      sources?: { url?: string; publisher?: string }[];
    };
    const [objSource, stringSource] = out.sources ?? [];
    expect(objSource?.url).toBe("https://aws.amazon.com/ec2/ri/marketplace/");
    expect(objSource?.publisher).toBe("aws.amazon.com");
    expect(stringSource?.url).toBe("https://www.crn.com/news/cloud/secondary-market");
    expect(stringSource?.title).toContain("crn.com");
  });

  it("regenerates invalid slugs from the title", () => {
    const out = sanitizeFor("writer", {
      title: "Choosing a Vector Database!",
      slug: "Not A Slug",
      metaTitle: "t",
      metaDescription: "d",
      content: "x".repeat(250),
      cta: "c",
    }) as { slug?: string };
    expect(out.slug).toBe("choosing-a-vector-database");
  });

  it("normalizes quality verdicts: casing, score strings, issue synonyms", () => {
    const raw = {
      status: "pass",
      score: "88",
      recommendations: ["Add links"],
    };
    const parsed = parseQualityReviewOutput(JSON.stringify(raw));
    expect(parsed?.status).toBe("PASS");
    if (parsed?.status === "PASS") expect(parsed.score).toBe(88);
  });

  it("maps FAIL issue severity/category synonyms into enum values", () => {
    const wire = JSON.stringify({
      status: "FAIL",
      score: "42",
      issues: [
        { severity: "critical", category: "factual_accuracy", description: "Bad stat", location: "intro" },
        { severity: "moderate", category: "SEO", description: "Weak headings", location: "h2" },
        "no citations for pricing claim", // bare string issue
      ],
    });
    const parsed = parseQualityReviewOutput(wire);
    expect(parsed?.status).toBe("FAIL");
    if (parsed?.status === "FAIL") {
      expect(parsed.issues[0]).toMatchObject({ severity: "high", category: "content_quality" });
      expect(parsed.issues[1]).toMatchObject({ severity: "medium", category: "seo" });
      expect(parsed.issues[2]?.description).toContain("no citations");
    }
  });

  it("gives FAIL-without-issues a default structured issue instead of rejecting", () => {
    const parsed = parseQualityReviewOutput(JSON.stringify({ status: "FAIL", score: 10 }));
    expect(parsed?.status).toBe("FAIL");
    if (parsed?.status === "FAIL") expect(parsed.issues.length).toBe(1);
  });

  it("normalizes asset type variants and numeric strings", () => {
    const out = sanitizeFor("image", {
      assets: [{ type: "Hero Image", url: "placehold.co/1200x630", altText: "a", description: "d" }],
    }) as { assets?: { type?: string; url?: string }[] };
    expect(out.assets?.[0]?.type).toBe("hero");
    expect(out.assets?.[0]?.url).toBe("https://placehold.co/1200x630");
  });

  it("wraps single-object sources into an array", () => {
    const out = sanitizeFor("research", {
      topic: "T",
      searchIntent: "S",
      sources: { title: "Only one", url: "https://example.com/a" },
    }) as { sources?: unknown[] };
    expect(out.sources).toHaveLength(1);
  });
});
