import { describe, it, expect } from "vitest";
import { extractJsonCandidate, parseLooseJson, truncateForLog } from "@/lib/json-extract";
import { parseQualityReviewOutput } from "@/contracts/artifacts";

const payload = { status: "PASS", score: 90 };

describe("loose json extraction", () => {
  it("parses bare JSON", () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses json inside markdown fences", () => {
    expect(parseLooseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseLooseJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("parses json embedded in prose before/after the object", () => {
    const text = 'Here is the requested output:\n{"a": "b"}\nLet me know if you need more.';
    expect(parseLooseJson(text)).toEqual({ a: "b" });
  });

  it("handles braces inside strings without breaking depth tracking", () => {
    expect(parseLooseJson('{"text": "curly } and { inside", "ok": true}')).toEqual({
      text: "curly } and { inside",
      ok: true,
    });
  });

  it("returns null for prose-only or broken payloads", () => {
    expect(parseLooseJson("no object here")).toBeNull();
    expect(parseLooseJson("{ broken")).toBeNull();
    expect(parseLooseJson("")).toBeNull();
  });

  it("extractJsonCandidate returns the balanced slice only", () => {
    expect(extractJsonCandidate('x {"a":1} y')).toBe('{"a":1}');
  });

  it("truncateForLog collapses whitespace and caps length", () => {
    const out = truncateForLog("{\n  long   text\n}", 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out).not.toContain("\n");
  });
});

describe("quality output tolerant parsing", () => {
  it("accepts the enveloped wire format inside fences", () => {
    const wire = '```json\n{"review": {"status": "FAIL", "score": 30, "issues": [{"severity":"high","category":"seo","description":"d","location":"l","suggestedFix":"f"}]}}\n```';
    const parsed = parseQualityReviewOutput(wire);
    expect(parsed?.status).toBe("FAIL");
  });

  it("still accepts the bare PASS/FAIL object used by fixtures", () => {
    expect(parseQualityReviewOutput(JSON.stringify(payload))?.status).toBe("PASS");
  });
});
