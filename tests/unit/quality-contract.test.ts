import { describe, it, expect } from "vitest";
import { qualityReviewSchema } from "@/contracts/artifacts";

const failIssue = {
  severity: "high",
  category: "content_quality",
  description: "Unsupported performance claim",
  location: "Section 2",
  suggestedFix: "Cite benchmark or remove",
};

describe("quality agent contract", () => {
  it("accepts PASS with score and recommendations", () => {
    const parsed = qualityReviewSchema.parse({
      status: "PASS",
      score: 90,
      recommendations: ["Add internal links"],
    });
    expect(parsed.status).toBe("PASS");
  });

  it("accepts FAIL only when at least one issue is present", () => {
    expect(
      qualityReviewSchema.safeParse({ status: "FAIL", score: 40, issues: [failIssue] }).success,
    ).toBe(true);
    expect(qualityReviewSchema.safeParse({ status: "FAIL", score: 40, issues: [] }).success).toBe(false);
  });

  it("rejects unknown statuses and out-of-range scores", () => {
    expect(qualityReviewSchema.safeParse({ status: "MAYBE", score: 50 }).success).toBe(false);
    expect(qualityReviewSchema.safeParse({ status: "PASS", score: 150 }).success).toBe(false);
  });

  it("constrains issue severities and categories", () => {
    expect(
      qualityReviewSchema.safeParse({
        status: "FAIL",
        score: 40,
        issues: [{ ...failIssue, severity: "critical" }],
      }).success,
    ).toBe(false);
    expect(
      qualityReviewSchema.safeParse({
        status: "FAIL",
        score: 40,
        issues: [{ ...failIssue, category: "vibes" }],
      }).success,
    ).toBe(false);
  });

  it("requires every issue field — vague feedback cannot pass validation", () => {
    const { suggestedFix: _sf, ...vague } = failIssue;
    expect(
      qualityReviewSchema.safeParse({ status: "FAIL", score: 40, issues: [vague] }).success,
    ).toBe(false);
  });
});
