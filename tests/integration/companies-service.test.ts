import { describe, it, expect, afterAll, beforeEach } from "vitest";
import {
  createCompany,
  getCompany,
  listCompanies,
  updateCompany,
  ValidationError,
  NotFoundError,
} from "@/services/companies";

beforeEach(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.company.deleteMany();
});

const base = {
  name: "Acme Analytics",
  industry: "Data analytics",
};

afterAll(async () => {
  // PrismaClient keeps the event loop alive; close it explicitly per test file.
  const { prisma } = await import("@/lib/db");
  await prisma.$disconnect();
});

describe("companies service", () => {
  it("creates, reads, lists, and updates a company", async () => {
    const created = await createCompany({
      ...base,
      website: "https://acme.example.com",
      brand: { voice: "Direct", tone: "Confident", styleRules: ["Be brief"], prohibitedLanguage: [] },
      competitors: ["RivalCo"],
    });

    expect(created.id).toBeTruthy();
    expect(created.brand.voice).toBe("Direct");
    expect(created.competitors).toEqual(["RivalCo"]);

    const fetched = await getCompany(created.id);
    expect(fetched.name).toBe("Acme Analytics");
    expect(fetched.website).toBe("https://acme.example.com");

    const updated = await updateCompany(created.id, {
      description: "Product analytics for modern teams",
      allowedClaims: ["SOC2 certified"],
    });
    expect(updated.description).toBe("Product analytics for modern teams");
    expect(updated.allowedClaims).toEqual(["SOC2 certified"]);
    expect(updated.name).toBe("Acme Analytics");

    const listed = await listCompanies();
    expect(listed).toHaveLength(1);
  });

  it("rejects invalid context with field-level issues and persists nothing", async () => {
    try {
      await createCompany({ name: "", website: "not-a-url" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validation = err as ValidationError;
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues.some((i) => i.path.includes("name"))).toBe(true);
    }
    expect(await listCompanies()).toHaveLength(0);
  });

  it("rejects an empty update patch without touching the record", async () => {
    const created = await createCompany(base);
    await expect(updateCompany(created.id, {})).rejects.toBeInstanceOf(ValidationError);
    const unchanged = await getCompany(created.id);
    expect(unchanged.industry).toBe("Data analytics");
  });

  it("throws NotFoundError for unknown ids", async () => {
    await expect(getCompany("does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateCompany("does-not-exist", { name: "X" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
