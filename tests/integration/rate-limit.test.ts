import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { MockAgentRuntime } from "@/lib/agent-runtime";
import { isTransientRateLimit, isDailyQuotaExhausted } from "@/lib/agent-runtime";
import { prisma } from "@/lib/db";

let campaignId: string;

beforeEach(async () => {
  await prisma.approval.deleteMany();
  await prisma.researchSource.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.content.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.company.deleteMany();

  const company = await createCompany({
    name: "Acme",
    audience: { primary: ["PMs"], secondary: [], painPoints: [] },
  });
  const campaign = await createCampaign(company.id, { name: "Q3", topics: ["T"] });
  campaignId = campaign.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("rate-limit classification", () => {
  it("flags transient per-minute 429s", () => {
    expect(isTransientRateLimit("Request failed (429): Rate limit exceeded")).toBe(true);
    expect(isTransientRateLimit("Provider returned rate_limit error")).toBe(true);
    expect(isTransientRateLimit("some other failure")).toBe(false);
    expect(isTransientRateLimit(undefined)).toBe(false);
  });

  it("distinguishes the daily free quota from transient limits", () => {
    const msg = "Rate limit exceeded: free-models-per-day. Add 10 credits.";
    expect(isDailyQuotaExhausted(msg)).toBe(true);
    // Daily exhaustion must NOT be classified as retryable-minutes.
    expect(isTransientRateLimit(msg) && !isDailyQuotaExhausted(msg)).toBe(false);
  });
});

describe("429 retry behavior", () => {
  it("completes a research stage that hits transient 429s mid-run", async () => {
    let researchCalls = 0;
    const runtime = new MockAgentRuntime((role, ctx) => {
      void ctx;
      if (role === "research") {
        return { rateLimitCallIndexes: [0, 1] }; // first two turns rate-limited
      }
      researchCalls += 0;
      return {};
    });

    const content = await prisma.content.create({
      data: { campaignId, topic: "Rate limit topic", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }

    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("AWAITING_APPROVAL");

    const researchRun = await prisma.agentRun.findFirst({
      where: { contentId: content.id, agentRole: "research" },
    });
    const acts = (researchRun?.activity ?? []) as { type: string; detail?: string }[];
    const retries = acts.filter((a) => a.type === "rate_limit_retry");
    expect(retries.length).toBeGreaterThanOrEqual(2);
    expect(retries[0].detail).toContain("429");
  });

  it("fails fast with actionable guidance when the DAILY quota is gone", async () => {
    // Daily exhaustion must not burn retry attempts waiting minutes.
    const runtime = new MockAgentRuntime((role) =>
      role === "research" ? { dailyQuotaCallIndexes: [0] } : {},
    );

    const content = await prisma.content.create({
      data: { campaignId, topic: "Daily quota topic", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }

    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason?.toLowerCase()).toContain("daily free quota exhausted");

    const researchRun = await prisma.agentRun.findFirst({
      where: { contentId: content.id, agentRole: "research" },
    });
    const acts = (researchRun?.activity ?? []) as { type: string }[];
    expect(acts.filter((a) => a.type === "rate_limit_retry")).toHaveLength(0);
  });
});
