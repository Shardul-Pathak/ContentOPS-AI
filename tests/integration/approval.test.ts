import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import { createCampaign } from "@/services/campaigns";
import { runWorkflow } from "@/services/workflow/orchestrator";
import { decideApproval } from "@/services/workflow/approval";
import { MockAgentRuntime } from "@/lib/agent-runtime";
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

async function runToAwaitingApproval(): Promise<string> {
  const content = await prisma.content.create({
    data: { campaignId, topic: "Approval topic", status: "CREATED" },
  });
  try {
    await runWorkflow(content.id);
  } catch {
    /* persisted */
  }
  return content.id;
}

describe("human approval gate", () => {
  it("creates a pending approval with the exact payload preview", async () => {
    const contentId = await runToAwaitingApproval();
    const approval = await prisma.approval.findFirst({ where: { contentId } });
    expect(approval?.status).toBe("PENDING");
    expect(approval?.destination).toBeTruthy();

    const summary = approval?.payloadSummary as Record<string, unknown>;
    expect(summary.title).toBeTruthy();
    expect(summary.slug).toMatch(/^[a-z0-9-]+$/);
    expect(summary.metaDescription).toBeTruthy();
    expect(summary.assetCount).toBeGreaterThan(0);
    expect(summary.externalAction).toContain("POST");
  });

  it("approving publishes exactly once and stores the published URL", async () => {
    const contentId = await runToAwaitingApproval();
    const result = await decideApproval(contentId, "approve");

    expect(result.status).toBe("PUBLISHED");
    expect(result.publishedUrl).toMatch(/^https?:\/\//);

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    expect(content.status).toBe("PUBLISHED");
    expect(content.publishedUrl).toBe(result.publishedUrl);

    // Exactly one execution: publisher sessions = prepare + execute.
    const publisherRuns = await prisma.agentRun.findMany({
      where: { contentId, agentRole: "publisher" },
    });
    expect(publisherRuns.length).toBe(1); // prepare only; execute is not a re-run of the agent stage
    const approvals = await prisma.approval.findMany({ where: { contentId } });
    expect(approvals.filter((a) => a.status === "APPROVED")).toHaveLength(1);
  });

  it("double-submit is rejected — the decision is consumed", async () => {
    const contentId = await runToAwaitingApproval();
    await decideApproval(contentId, "approve");
    await expect(decideApproval(contentId, "approve")).rejects.toMatchObject({
      name: "ApprovalConflictError",
    });
  });

  it("rejecting cancels without executing anything", async () => {
    const contentId = await runToAwaitingApproval();
    const result = await decideApproval(contentId, "reject");

    expect(result.status).toBe("CANCELLED");
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    expect(content.status).toBe("CANCELLED");
    expect(content.publishedUrl).toBeNull();

    // A rejected workflow cannot be approved afterwards.
    await expect(decideApproval(contentId, "approve")).rejects.toMatchObject({
      name: "ApprovalConflictError",
    });
  });

  it("a stale approval cannot authorize a different state — status guards decisions", async () => {
    const contentId = await runToAwaitingApproval();
    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    expect(content.status).toBe("AWAITING_APPROVAL");

    // Simulate drift: someone regenerates the workflow (new FAILED state)
    // while an old PENDING approval still exists.
    await prisma.content.update({
      where: { id: contentId },
      data: { status: "FAILED", failureReason: "regenerated" },
    });
    await expect(decideApproval(contentId, "approve")).rejects.toMatchObject({
      name: "ApprovalConflictError",
    });
    const approval = await prisma.approval.findFirst({ where: { contentId } });
    expect(approval?.status).toBe("PENDING"); // untouched, but unusable
  });

  it("publishing failure lands in FAILED with the real error", async () => {
    const contentId = await runToAwaitingApproval();

    // Execute session fails (every publisher session of this runtime fails).
    const failingRuntime = new MockAgentRuntime((role) =>
      role === "publisher" ? { failSessionOrdinals: [1, 2] } : {},
    );

    await expect(decideApproval(contentId, "approve", failingRuntime)).rejects.toThrow(
      /publishing agent did not return a valid result/,
    );

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    expect(content.status).toBe("FAILED");
    expect(content.failureReason).toContain("Publishing failed");
    expect(content.publishedUrl).toBeNull();
  });
});
