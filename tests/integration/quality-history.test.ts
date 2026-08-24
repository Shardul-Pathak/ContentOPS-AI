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
    name: "Acme Analytics",
    audience: { primary: ["PMs"], secondary: [], painPoints: [] },
  });
  const campaign = await createCampaign(company.id, { name: "Q3", topics: ["T"] });
  campaignId = campaign.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function failThenPassRuntime(failTimes: number) {
  let qualityCalls = 0;
  return new MockAgentRuntime((role) => {
    if (role !== "quality") return {};
    return {
      overrideOutputText: () => {
        qualityCalls += 1;
        if (qualityCalls <= failTimes) {
          return JSON.stringify({
            status: "FAIL",
            score: 45,
            issues: [
              {
                severity: "medium",
                category: "seo",
                description: `Issue number ${qualityCalls}`,
                location: "body",
                suggestedFix: `Fix number ${qualityCalls}`,
              },
            ],
            recommendations: [],
          });
        }
        return null; // fixture PASS
      },
    };
  });
}

describe("quality review workflow", () => {
  it("preserves every prior review in execution history across revisions", async () => {
    const content = await prisma.content.create({
      data: { campaignId, topic: "History topic", status: "CREATED" },
    });
    // FAIL once, then PASS.
    await runWorkflow(content.id, failThenPassRuntime(1));

    const qualityRuns = await prisma.agentRun.findMany({
      where: { contentId: content.id, agentRole: "quality" },
      orderBy: { startedAt: "asc" },
    });
    expect(qualityRuns.length).toBe(2);

    // First review (FAIL) is still retrievable — history is never discarded.
    expect((qualityRuns[0].output as { status: string }).status).toBe("FAIL");
    expect((qualityRuns[1].output as { status: string }).status).toBe("PASS");

    const stored = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect((stored.qualityReview as { status: string }).status).toBe("PASS");
    expect(stored.revisionCount).toBe(1);
    expect(stored.status).toBe("AWAITING_APPROVAL");
  });

  it("routes structured reviewer feedback into the revision writer prompt", async () => {
    const runtime = failThenPassRuntime(1);
    const content = await prisma.content.create({
      data: { campaignId, topic: "Feedback topic", status: "CREATED" },
    });
    await runWorkflow(content.id, runtime);

    const writerPrompts = runtime.recordedPrompts.filter((p) => p.role === "writer");
    expect(writerPrompts.length).toBe(2);

    // The revision call must carry the structured feedback — the writer
    // cannot act on feedback it never receives.
    expect(writerPrompts[0].content).not.toContain("revisionFeedback");
    expect(writerPrompts[1].content).toContain("revisionFeedback");
    expect(writerPrompts[1].content).toContain("Issue number 1");
    expect(writerPrompts[1].content).toContain("Fix number 1");
  });

  it("never lets the reviewer rewrite — verdict only", async () => {
    const runtime = failThenPassRuntime(0); // immediate PASS
    const content = await prisma.content.create({
      data: { campaignId, topic: "Clean pass", status: "CREATED" },
    });
    await runWorkflow(content.id, runtime);

    // No second writer call without a FAIL — the reviewer cannot replace the draft.
    const writerPrompts = runtime.recordedPrompts.filter((p) => p.role === "writer");
    expect(writerPrompts.length).toBe(1);
  });
});
