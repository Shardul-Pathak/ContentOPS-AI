import { describe, it, expect } from "vitest";
import {
  companyContextInputSchema,
  companyContextUpdateSchema,
} from "@/contracts/company-context";

const validContext = {
  name: "Acme Analytics",
  website: "https://acme.example.com",
  industry: "Data analytics",
  products: [
    { name: "Pulse", description: "Product analytics", features: ["Funnels"], targetUsers: ["PMs"] },
  ],
  audience: { primary: ["Product managers"], secondary: [], painPoints: ["No visibility"] },
  brand: { voice: "Direct", tone: "Confident", styleRules: ["Short sentences"], prohibitedLanguage: ["guru"] },
  marketing: { goals: ["Awareness"], valuePropositions: ["Fast insights"], ctas: ["Book a demo"] },
  competitors: ["RivalCo"],
  allowedClaims: ["SOC2 certified"],
  prohibitedClaims: ["Cheapest on the market"],
  contentTypes: ["How-to"],
};

describe("company context contract", () => {
  it("accepts a fully specified context", () => {
    const parsed = companyContextInputSchema.parse(validContext);
    expect(parsed.name).toBe("Acme Analytics");
    expect(parsed.brand.styleRules).toEqual(["Short sentences"]);
  });

  it("applies defaults for optional sections", () => {
    const parsed = companyContextInputSchema.parse({ name: "Minima" });
    expect(parsed.products).toEqual([]);
    expect(parsed.audience.primary).toEqual([]);
    expect(parsed.competitors).toEqual([]);
  });

  it("rejects a missing name", () => {
    const result = companyContextInputSchema.safeParse({ industry: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-http website", () => {
    const result = companyContextInputSchema.safeParse({
      name: "X",
      website: "ftp://files.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a product without a name", () => {
    const result = companyContextInputSchema.safeParse({
      name: "X",
      products: [{ features: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty update patch", () => {
    const result = companyContextUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a partial update patch", () => {
    const result = companyContextUpdateSchema.safeParse({ industry: "Retail" });
    expect(result.success).toBe(true);
  });
});
