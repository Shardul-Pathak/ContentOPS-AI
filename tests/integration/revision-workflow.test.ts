import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { MockAgentRuntime } from "@/lib/agent-runtime";
import { prisma } from "@/lib/db";

let campaignId: string;

beforeEach(async () => {
  await prisma.researchSource.deleteMany();
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

describe("revision workflow guarantees", () => {
  it("numbers agent-run attempts by revision cycle (1-based)", async () => {
    let qualityCalls = 0;
    const runtime = new MockAgentRuntime((role) => {
      if (role !== "quality") return {};
      return {
        overrideOutputText: () => {
          qualityCalls += 1;
          if (qualityCalls === 1) {
            return JSON.stringify({
              status: "FAIL",
              score: 50,
              issues: [
                { severity: "low", category: "seo", description: "Weak title", location: "title", suggestedFix: "Sharpen title" },
              ],
              recommendations: [],
            });
          }
          return null;
        },
      };
    });

    const content = await prisma.content.create({
      data: { campaignId, topic: "Attempts topic", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }

    const writerRuns = await prisma.agentRun.findMany({
      where: { contentId: content.id, agentRole: "writer" },
      orderBy: { startedAt: "asc" },
    });
    expect(writerRuns.map((r) => r.attempt)).toEqual([1, 2]);
  });

  it("reports which issues forced human intervention after the limit", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "quality"
        ? {
            overrideOutputText: () =>
              JSON.stringify({
                status: "FAIL",
                score: 30,
                issues: [
                  {
                    severity: "high",
                    category: "brand_compliance",
                    description: "Prohibited claim used",
                    location: "intro",
                    suggestedFix: "Remove prohibited claim",
                  },
                ],
                recommendations: [],
              }),
          }
        : {},
    );

    const content = await prisma.content.create({
      data: { campaignId, topic: "Limit topic", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }

    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("REQUIRES_HUMAN_INTERVENTION");
    expect(after.failureReason).toContain("Prohibited claim used");
    expect(after.currentAgent).toBeNull();
  });
});
