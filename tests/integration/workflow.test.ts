import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { MockAgentRuntime, fixtureOutput, type MockScriptEntry } from "@/lib/agent-runtime";
import { prisma } from "@/lib/db";

let campaignId: string;

beforeEach(async () => {
  await prisma.agentRun.deleteMany();
  await prisma.content.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.company.deleteMany();

  const company = await createCompany({
    name: "Acme Analytics",
    audience: { primary: ["Product managers"], secondary: [], painPoints: ["No visibility"] },
    brand: { voice: "Direct", tone: "Confident", styleRules: [], prohibitedLanguage: [] },
  });
  const campaign = await createCampaign(company.id, {
    name: "Q3 Content",
    topics: ["Vector databases for product analytics"],
  });
  campaignId = campaign.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function startTestContent(topic: string): Promise<string> {
  const content = await prisma.content.create({
    data: { campaignId, topic, status: "CREATED" },
  });
  return content.id;
}

async function runToCompletion(contentId: string, runtime?: MockAgentRuntime) {
  // Run in-process and swallow the rethrown error (failure is persisted).
  try {
    await runWorkflow(contentId, runtime);
  } catch {
    /* failure state already recorded */
  }
  return prisma.content.findUniqueOrThrow({
    where: { id: contentId },
    include: { agentRuns: true },
  });
}

describe("workflow orchestration (mock runtime)", () => {
  it("reaches AWAITING_APPROVAL with validated artifacts on the happy path", async () => {
    const contentId = await startTestContent("Vector databases for product analytics");
    const content = await runToCompletion(contentId);

    expect(content.status).toBe("AWAITING_APPROVAL");
    expect(content.failureReason).toBeNull();

    expect(content.research).toMatchObject({ topic: expect.any(String) });
    if (!content.research) throw new Error("research missing");
    const sources = (content.research as { sources?: unknown[] }).sources ?? [];
    expect(sources.length).toBeGreaterThan(0);

    expect(content.strategy).toMatchObject({ primaryTopic: expect.any(String) });
    expect(content.draft).toMatchObject({
      title: expect.any(String),
      slug: expect.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      content: expect.stringMatching(/vector/i),
    });
    expect(content.qualityReview).toMatchObject({ status: "PASS" });

    const assets = await prisma.asset.findMany({ where: { contentId: content.id } });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0]).toMatchObject({ type: "hero", altText: expect.any(String) });

    const roles = content.agentRuns.map((r) => r.agentRole);
    expect(roles).toEqual(["research", "growth", "writer", "quality", "image", "publisher"]);
    for (const run of content.agentRuns) {
      // The publisher run stays RUNNING while paused at the approval gate.
      const expectedStatus = run.agentRole === "publisher" ? "RUNNING" : "DONE";
      expect(run.status).toBe(expectedStatus);
      expect(run.trueforgeSessionId).toBeTruthy();
    }
  });

  it("stops at AWAITING_APPROVAL — never publishes without approval", async () => {
    const contentId = await startTestContent("Any topic");
    const content = await runToCompletion(contentId);
    expect(content.status).toBe("AWAITING_APPROVAL");
    expect(content.status).not.toBe("PUBLISHED");
    expect(content.status).not.toBe("PUBLISHING");
  });

  it("escalates to REQUIRES_HUMAN_INTERVENTION after MAX_REVISIONS failures", async () => {
    const failQuality: (role: string) => MockScriptEntry = (role) =>
      role === "quality"
        ? {
            overrideOutputText: () =>
              JSON.stringify({
                status: "FAIL",
                score: 40,
                issues: [
                  {
                    severity: "high",
                    category: "content_quality",
                    description: "Unsupported claim present",
                    location: "body",
                    suggestedFix: "Remove or source the claim",
                  },
                ],
                recommendations: [],
              }),
          }
        : {};

    const contentId = await startTestContent("Some topic");
    const content = await runToCompletion(contentId, new MockAgentRuntime(failQuality));

    expect(content.status).toBe("REQUIRES_HUMAN_INTERVENTION");
    expect(content.revisionCount).toBe(3);
    expect(content.failureReason).toContain("MAX_REVISIONS");

    const writerRuns = content.agentRuns.filter((r) => r.agentRole === "writer");
    expect(writerRuns.length).toBe(4); // initial draft + 3 revision cycles
    const qualityRuns = content.agentRuns.filter((r) => r.agentRole === "quality");
    expect(qualityRuns.length).toBe(4);
  });

  it("fails the workflow when company context is incomplete", async () => {
    const company = await createCompany({ name: "Bare Co" }); // no audience
    const campaign = await createCampaign(company.id, { name: "C", topics: ["T"] });
    const content = await prisma.content.create({
      data: { campaignId: campaign.id, topic: "T", status: "CREATED" },
    });

    await runToCompletion(content.id);
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toContain("audience");
  });

  it("recovers via corrective retry when an agent returns garbage once", async () => {
    let researchCalls = 0;
    const runtime = new MockAgentRuntime((role) => {
      if (role !== "research") return {};
      return {
        overrideOutputText: () => {
          researchCalls += 1;
          if (researchCalls === 1) return "not json at all";
          return null; // fall back to fixture
        },
      };
    });

    const contentId = await startTestContent("Retry topic");
    const content = await runToCompletion(contentId, runtime);
    expect(content.status).toBe("AWAITING_APPROVAL");

    const failedRuns = content.agentRuns.filter((r) => r.status === "FAILED");
    expect(failedRuns.length).toBe(0); // retry succeeded within the same stage
  });

  it("tolerates markdown-fenced research output without burning the retry", async () => {
    const fixture = JSON.stringify(fixtureOutput("research"));
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? { overrideOutputText: () => "```json\n" + fixture + "\n```" }
        : {},
    );

    const contentId = await startTestContent("Fenced output topic");
    const content = await runToCompletion(contentId, runtime);
    expect(content.status).toBe("AWAITING_APPROVAL");

    // Fences are stripped transparently — no corrective-retry turn happened.
    const failedRuns = content.agentRuns.filter((r) => r.status === "FAILED");
    expect(failedRuns.length).toBe(0);
  });

  it("corrects schema drift by naming the missing keys in the retry prompt", async () => {
    // First research turn: valid JSON, WRONG shape (invented "audience",
    // dropped four required fields) — exactly what minimax produced live.
    const drifted = JSON.stringify({
      topic: "AI infrastructure cost optimization",
      audience: "Startup founders and engineering leads",
    });
    let researchCalls = 0;
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? {
            overrideOutputText: (_ctx, prompt) => {
              if (prompt.includes("failed this stage's contract validation")) {
                // Corrective pass returns the proper fixture.
                return null; // fall through to fixture
              }
              researchCalls += 1;
              return "```json\n" + drifted + "\n```";
            },
          }
        : {},
    );

    const contentId = await startTestContent("Schema drift topic");
    const content = await runToCompletion(contentId, runtime);
    expect(content.status).toBe("AWAITING_APPROVAL");

    const writerPrompts = runtime.recordedPrompts.filter((p) => p.role === "research");
    const corrective = writerPrompts.find((p) => p.content.includes("contract validation"));
    expect(corrective).toBeDefined();
    expect(corrective!.content).toContain("searchIntent");
    expect(corrective!.content).toContain("audienceQuestions");
  });

  it("reports a friendly error (not a raw parser message) when output stays invalid", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? { overrideOutputText: () => "I could not produce valid JSON, sorry." }
        : {},
    );

    const contentId = await startTestContent("Invalid forever");
    try {
      await runWorkflow(contentId, runtime);
    } catch {
      /* persisted */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toContain("rejected by the research contract");
    expect(after.failureReason).toContain("no JSON object could be extracted");
    expect(after.failureReason).not.toContain("position 2");
  });

  it("records a FAILED agent run when the provider errors", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "growth" ? { failCallIndexes: [0] } : {},
    );
    const contentId = await startTestContent("Failing strategy");
    const content = await runToCompletion(contentId, runtime);

    expect(content.status).toBe("FAILED");
    expect(content.currentAgent).toBeNull();
    const growthRun = content.agentRuns.find((r) => r.agentRole === "growth");
    expect(growthRun?.status).toBe("FAILED");
    expect(growthRun?.error).toContain("mock provider failure");
  });
});
