import { describe, it, expect } from "vitest";
import { articleDraftSchema } from "@/contracts/artifacts";
import { fixtureOutput } from "@/lib/agent-runtime";

const baseDraft = {
  title: "Choosing a Vector Database",
  slug: "choosing-a-vector-database",
  metaTitle: "Vector Databases: A Guide",
  metaDescription: "Selection criteria for teams.",
  content: "# Choosing a Vector Database\n\n" + "Real analysis follows. ".repeat(12),
  headings: ["Why it matters", "Criteria"],
  cta: "Book a demo",
};

describe("writer agent contract", () => {
  it("accepts a valid draft and defaults sources to empty", () => {
    const parsed = articleDraftSchema.parse(baseDraft);
    expect(parsed.sources).toEqual([]);
  });

  it("rejects non-kebab-case slugs", () => {
    const result = articleDraftSchema.safeParse({ ...baseDraft, slug: "Not A Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects stub-length article bodies", () => {
    const result = articleDraftSchema.safeParse({ ...baseDraft, content: "too short" });
    expect(result.success).toBe(false);
  });

  it("requires meta fields — no untitled, unsummarized articles", () => {
    const { metaTitle: _m, ...noMetaTitle } = baseDraft;
    expect(articleDraftSchema.safeParse(noMetaTitle).success).toBe(false);
    const { metaDescription: _d, ...noMetaDescription } = baseDraft;
    expect(articleDraftSchema.safeParse(noMetaDescription).success).toBe(false);
  });

  it("mock writer fixture satisfies the contract (used by CI pipeline tests)", () => {
    expect(() => articleDraftSchema.parse(fixtureOutput("writer"))).not.toThrow();
  });
});
