import type { AgentRole } from "@/config/agents";

// Formatting-level normalization for agent outputs, applied before schema
// validation. Rule of thumb: representation slips (objects where strings were
// asked, missing URL schemes, casing, numeric strings) are sanitized; MEANING
// is never invented — anything un-coercible stays invalid and the corrective
// retry / failure path handles it.

const STRING_KEYS = [
  "text",
  "title",
  "name",
  "point",
  "question",
  "issue",
  "summary",
  "description",
  "content",
  "value",
  "label",
  "statement",
  "insight",
] as const;

export function coerceString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length > 0 ? coerceString(v[0]) : undefined;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of STRING_KEYS) {
      if (o[key] != null) {
        const s = coerceString(o[key]);
        if (s) return s;
      }
    }
  }
  return undefined;
}

export function coerceStringArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t ? [t] : undefined;
  }
  if (!Array.isArray(v)) {
    const s = coerceString(v);
    return s ? [s] : undefined;
  }
  const out = v.map(coerceString).filter((x): x is string => x != null);
  return out;
}

export function coerceNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function coerceUrl(v: unknown): string | undefined {
  const s = coerceString(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  // bare domains like www.x.com or blog.y.io/post get a scheme
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return s;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v != null && typeof v === "object" && !Array.isArray(v);

function sanitizeSource(src: unknown): Obj | null {
  if (src == null) return null;
  if (typeof src === "string") {
    // A bare URL string was provided instead of a source object.
    const url = coerceUrl(src);
    return url
      ? { title: url, url, publisher: hostFrom(url), relevance: "Referenced link", claimsSupported: [] }
      : null;
  }
  if (!isObj(src)) return null;
  const title = coerceString(src.title ?? src.name ?? src.headline);
  const url = coerceUrl(src.url ?? src.link ?? src.source ?? title);
  if (!url) return null;
  return {
    title: title ?? url,
    url,
    publisher: coerceString(src.publisher ?? src.site ?? src.organization) ?? hostFrom(url),
    relevance:
      coerceString(src.relevance ?? src.why ?? src.note ?? src.reason) ??
      "Cited in research",
    claimsSupported: coerceStringArray(src.claimsSupported ?? src.claims ?? src.evidence) ?? [],
  };
}

function hostFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sanitizeSources(v: unknown): unknown {
  if (v == null) return v;
  const list = Array.isArray(v) ? v : [v]; // single object → array
  const out = list.map(sanitizeSource).filter((s): s is Obj => s != null);
  return out;
}

function sanitizeResearch(raw: Obj): Obj {
  const o = { ...raw };
  o.topic = coerceString(o.topic);
  o.searchIntent = coerceString(o.searchIntent);
  o.audienceQuestions = coerceStringArray(o.audienceQuestions) ?? [];
  o.painPoints = coerceStringArray(o.painPoints) ?? [];
  o.keyPoints = coerceStringArray(o.keyPoints) ?? [];
  o.contentOpportunities = coerceStringArray(o.contentOpportunities) ?? [];
  o.limitations = coerceStringArray(o.limitations) ?? [];
  o.sources = sanitizeSources(o.sources) ?? [];
  return o;
}

function sanitizeStrategy(raw: Obj): Obj {
  const o = { ...raw };
  for (const key of ["primaryTopic", "searchIntent", "contentAngle", "productPositioning", "ctaStrategy"]) {
    o[key] = coerceString(o[key]);
  }
  for (const key of ["targetQuestions", "primaryKeywords", "secondaryTopics", "recommendedStructure", "contentGaps"]) {
    o[key] = coerceStringArray(o[key]) ?? [];
  }
  return o;
}

function slugValue(o: Obj): string {
  const rawSlug = coerceString(o.slug);
  if (rawSlug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(rawSlug)) return rawSlug;
  return slugify(coerceString(o.title) ?? rawSlug ?? "article");
}

function sanitizeDraft(raw: Obj): Obj {
  const o = { ...raw };
  o.title = coerceString(o.title);
  o.slug = slugValue(o);
  o.metaTitle = coerceString(o.metaTitle);
  o.metaDescription = coerceString(o.metaDescription);
  const content = coerceString(o.content);
  o.content = content ?? "";
  o.cta = coerceString(o.cta);
  o.headings = coerceStringArray(o.headings) ?? [];
  o.sources = sanitizeSources(o.sources) ?? [];
  return o;
}

const SEVERITY_MAP: Record<string, "low" | "medium" | "high"> = {
  low: "low",
  minor: "low",
  medium: "medium",
  moderate: "medium",
  med: "medium",
  high: "high",
  major: "high",
  critical: "high",
  severe: "high",
};

const CATEGORY_MAP: Record<string, "seo" | "content_quality" | "brand_compliance"> = {
  seo: "seo",
  brand: "brand_compliance",
  brand_compliance: "brand_compliance",
  compliance: "brand_compliance",
  quality: "content_quality",
  content: "content_quality",
  content_quality: "content_quality",
  factual: "content_quality",
  factual_accuracy: "content_quality",
  accuracy: "content_quality",
};

function sanitizeQualityIssue(issue: unknown): Obj | null {
  if (typeof issue === "string") {
    const description = coerceString(issue);
    return description
      ? {
          severity: "medium",
          category: "content_quality",
          description,
          location: "(unspecified)",
          suggestedFix: "Review manually",
        }
      : null;
  }
  if (!isObj(issue)) return null;
  const severityRaw = (coerceString(issue.severity) ?? "medium").toLowerCase();
  const categoryRaw = (coerceString(issue.category) ?? "content_quality").toLowerCase();
  return {
    severity: SEVERITY_MAP[severityRaw] ?? "medium",
    category: CATEGORY_MAP[categoryRaw] ?? "content_quality",
    // Placeholders must satisfy min-length(1) on these fields.
    description:
      coerceString(issue.description ?? issue.message ?? issue.problem) ?? "Unspecified issue",
    location: coerceString(issue.location ?? issue.where ?? issue.section) ?? "(unspecified)",
    suggestedFix:
      coerceString(issue.suggestedFix ?? issue.fix ?? issue.suggestion) ?? "Review manually",
  };
}

function sanitizeQuality(raw: Obj): Obj {
  const o = { ...raw };
  const status = (coerceString(o.status) ?? "").toUpperCase();
  o.status = status.startsWith("P") ? "PASS" : status.startsWith("F") ? "FAIL" : o.status;
  const score = coerceNumber(o.score);
  o.score =
    score == null
      ? o.score
      : Math.max(0, Math.min(100, Math.round(score)));
  if (Array.isArray(o.issues)) {
    o.issues = o.issues.map(sanitizeQualityIssue).filter((i): i is Obj => i != null);
  } else if (typeof o.issues === "string") {
    const asIssue = sanitizeQualityIssue(o.issues);
    o.issues = asIssue ? [asIssue] : [];
  } else if (o.issues == null && o.status === "FAIL") {
    o.issues = [
      {
        severity: "high",
        category: "content_quality",
        description: "Review failed without structured issues",
        location: "(unspecified)",
        suggestedFix: "Re-run review",
      },
    ];
  }
  o.recommendations = coerceStringArray(o.recommendations) ?? [];
  return o;
}

function sanitizeAssets(raw: Obj): Obj {
  const o = { ...raw };
  let list = Array.isArray(o.assets) ? o.assets : o.assets != null ? [o.assets] : [];
  list = list.map((a) => {
    if (!isObj(a)) return a;
    const out = { ...a };
    const type = (coerceString(out.type) ?? "hero").toLowerCase().replace(/[^a-z]/g, "");
    out.type = type.startsWith("hero") ? "hero" : "inline";
    out.url = coerceUrl(out.url);
    out.altText = coerceString(out.altText) ?? "";
    out.description = coerceString(out.description) ?? "";
    return out;
  });
  o.assets = list;
  return o;
}

function sanitizePayload(raw: Obj): Obj {
  const o = { ...raw };
  for (const key of ["destination", "title", "slug", "metaDescription", "externalAction"]) {
    o[key] = coerceString(o[key]);
  }
  o.assetCount = coerceNumber(o.assetCount);
  return o;
}

/** Normalizes a parsed stage output so it can be schema-validated fairly. */
export function sanitizeFor(role: AgentRole, parsedJson: unknown): unknown {
  if (parsedJson == null || typeof parsedJson !== "object") return parsedJson;
  const raw = parsedJson as Obj;
  switch (role) {
    case "research":
      return sanitizeResearch(raw);
    case "growth":
      return sanitizeStrategy(raw);
    case "writer":
      return sanitizeDraft(raw);
    case "quality":
      return sanitizeQuality(raw);
    case "image":
      return sanitizeAssets(raw);
    case "publisher":
      return sanitizePayload(raw);
    default:
      return raw;
  }
}
