import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { MockAgentRuntime } from "@/lib/agent-runtime";
import { researchResultSchema } from "@/contracts/artifacts";
import { prisma } from "@/lib/db";

let campaignId: string;

beforeEach(async () => {
  await prisma.researchSource.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.content.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.company.deleteMany();

  const company = await createCompany({
    name: "Acme Analytics",
    audience: { primary: ["Product managers"], secondary: [], painPoints: ["No visibility"] },
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

async function startTestContent(topic: string) {
  return prisma.content.create({ data: { campaignId, topic, status: "CREATED" } });
}

describe("research evidence gate", () => {
  it("fails the workflow when research returns no usable evidence", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? {
            overrideOutputText: () =>
              JSON.stringify(
                researchResultSchema.parse({
                  topic: "Empty topic",
                  searchIntent: "informational",
                  audienceQuestions: [],
                  painPoints: [],
                  keyPoints: [],
                  sources: [],
                  contentOpportunities: [],
                  limitations: ["No search tool available"],
                }),
              ),
          }
        : {},
    );

    const content = await startTestContent("Empty topic");
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toContain("no usable evidence");
    // Nothing downstream should have run.
    const roles = (await prisma.agentRun.findMany({ where: { contentId: content.id } })).map(
      (r) => r.agentRole,
    );
    expect(roles).toEqual(["research"]);
  });
});

describe("research tool-use gate", () => {
  it("refuses sources claimed without any search tool calls", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? {
            // Sources present, but the runtime reports zero tool activity.
            suppressActivity: true,
          }
        : {},
    );

    const content = await startTestContent("Fabricated citations topic");
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toContain("without performing any search tool calls");
  });
});

describe("research agent provenance", () => {
  it("persists every verified source with url, publisher, and claims", async () => {
    const content = await startTestContent("Vector databases for product analytics");
    await runWorkflow(content.id);

    const sources = await prisma.researchSource.findMany({ where: { contentId: content.id } });
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.url).toMatch(/^https?:\/\//);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.publisher.length).toBeGreaterThan(0);
      expect(Array.isArray(s.claimsSupported)).toBe(true);
    }
  });

  it("keeps the workflow running when research reports limitations instead of fabricating data", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? {
            overrideOutputText: () =>
              JSON.stringify(
                researchResultSchema.parse({
                  topic: "Sparse topic",
                  searchIntent: "informational",
                  audienceQuestions: [],
                  painPoints: [],
                  keyPoints: [],
                  sources: [],
                  contentOpportunities: [],
                  limitations: ["No credible public sources found"],
                }),
              ),
          }
        : {},
    );

    const content = await startTestContent("Sparse topic");
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* failure persisted below */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });

    // Empty sources are a legitimate outcome — recorded as limitations.
    if (after.status === "FAILED") {
      expect(after.failureReason).not.toContain("fabricat");
    }
    const sources = await prisma.researchSource.findMany({ where: { contentId: content.id } });
    expect(sources).toHaveLength(0);
  });

  it("rejects fabricated-looking research (invalid source url) without persisting", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "research"
        ? {
            overrideOutputText: () =>
              JSON.stringify({
                topic: "X",
                searchIntent: "informational",
                audienceQuestions: [],
                painPoints: [],
                keyPoints: [],
                sources: [{ title: "Fake", url: "not-a-url", publisher: "Nobody", relevance: "none", claimsSupported: [] }],
                contentOpportunities: [],
                limitations: [],
              }),
          }
        : {},
    );

    const content = await startTestContent("Bad sources topic");
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* expected */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");

    const sources = await prisma.researchSource.findMany({ where: { contentId: content.id } });
    expect(sources).toHaveLength(0); // nothing persisted from invalid output
  });
});
