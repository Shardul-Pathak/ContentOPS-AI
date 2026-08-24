import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createCompany } from "@/services/companies";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from "@/services/campaigns";

let companyId: string;

beforeEach(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.campaign.deleteMany();
  await prisma.company.deleteMany();
  const company = await createCompany({
    name: "Acme Analytics",
    audience: { primary: ["PMs"], secondary: [], painPoints: [] },
  });
  companyId = company.id;
});

afterAll(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
});

describe("campaigns service", () => {
  it("creates a campaign for an existing company with default status DRAFT", async () => {
    const created = await createCampaign(companyId, {
      name: "Q3 Launch",
      topics: ["Topic A", "Topic B"],
      goal: "Signups",
    });
    expect(created.status).toBe("DRAFT");
    expect(created.companyId).toBe(companyId);
    expect(created.topics).toEqual(["Topic A", "Topic B"]);

    const fetched = await getCampaign(created.id);
    expect(fetched.name).toBe("Q3 Launch");
  });

  it("rejects creation for a non-existent company", async () => {
    await expect(
      createCampaign("missing-company", { name: "X", topics: ["T"] }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("rejects invalid input without persisting", async () => {
    await expect(
      createCampaign(companyId, { name: "", topics: [] }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(await listCampaigns()).toHaveLength(0);
  });

  it("lists campaigns scoped to a company", async () => {
    await createCampaign(companyId, { name: "A", topics: ["t"] });
    const other = await createCompany({ name: "Other Co" });
    await createCampaign(other.id, { name: "B", topics: ["t"] });

    expect(await listCampaigns()).toHaveLength(2);
    const scoped = await listCampaigns(companyId);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].name).toBe("A");
  });

  it("enforces legal status transitions only", async () => {
    const c = await createCampaign(companyId, { name: "C", topics: ["t"] });

    const activated = await updateCampaign(c.id, { status: "ACTIVE" });
    expect(activated.status).toBe("ACTIVE");

    // ACTIVE → DRAFT is illegal
    await expect(updateCampaign(c.id, { status: "DRAFT" })).rejects.toMatchObject({
      name: "ValidationError",
    });

    const completed = await updateCampaign(c.id, { status: "COMPLETED" });
    expect(completed.status).toBe("COMPLETED");

    // COMPLETED is terminal
    await expect(updateCampaign(c.id, { status: "ACTIVE" })).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("locks content edits once the campaign leaves editable statuses", async () => {
    const c = await createCampaign(companyId, { name: "Editable", topics: ["t1"] });
    await updateCampaign(c.id, { topics: ["t2"] }); // still DRAFT
    await updateCampaign(c.id, { status: "ACTIVE" });
    await updateCampaign(c.id, { name: "Renamed while active" }); // still editable

    await updateCampaign(c.id, { status: "COMPLETED" });
    await expect(
      updateCampaign(c.id, { name: "Too late" }),
    ).rejects.toMatchObject({ name: "ValidationError" });

    // Status-only changes are also blocked from terminal states by transition rules
    const frozen = await getCampaign(c.id);
    expect(frozen.name).toBe("Renamed while active");
  });
});
