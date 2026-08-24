import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { MockAgentRuntime } from "@/lib/agent-runtime";
import { assetSetSchema } from "@/contracts/artifacts";
import { prisma } from "@/lib/db";

let campaignId: string;

beforeEach(async () => {
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

describe("image agent", () => {
  it("fails explicitly when generation errors — assets are never silently skipped", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "image" ? { failCallIndexes: [0] } : {},
    );
    const content = await prisma.content.create({
      data: { campaignId, topic: "Image failure topic", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }

    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toContain("image");

    const imageRun = await prisma.agentRun.findFirst({
      where: { contentId: content.id, agentRole: "image" },
    });
    expect(imageRun?.status).toBe("FAILED");
    // The workflow must NOT reach approval without its required hero asset.
    expect(after.status).not.toBe("AWAITING_APPROVAL");
  });

  it("rejects asset output with missing alt text before persistence", async () => {
    const runtime = new MockAgentRuntime((role) =>
      role === "image"
        ? {
            overrideOutputText: () =>
              JSON.stringify(
                (() => {
                  const bad = {
                    assets: [{ type: "hero", url: "https://placehold.co/1200x630", altText: "", description: "d" }],
                  };
                  return bad;
                })(),
              ),
          }
        : {},
    );

    // Sanity: the contract itself rejects empty alt text.
    expect(
      assetSetSchema.safeParse({
        assets: [{ type: "hero", url: "https://placehold.co/1200x630", altText: "", description: "d" }],
      }).success,
    ).toBe(false);

    const content = await prisma.content.create({
      data: { campaignId, topic: "Bad alt text", status: "CREATED" },
    });
    try {
      await runWorkflow(content.id, runtime);
    } catch {
      /* persisted */
    }
    const after = await prisma.content.findUniqueOrThrow({ where: { id: content.id } });
    expect(after.status).toBe("FAILED");
    expect(await prisma.asset.findMany({ where: { contentId: content.id } })).toHaveLength(0);
  });
});
