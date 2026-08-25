import type { TrueForgeApi } from "@truefoundry/trueforge-sdk";import {
  articleDraftSchema,
  assetSetSchema,
  contentStrategySchema,
  jsonSchemaFor,
  publishPayloadSchema,
  qualityReviewResponseSchema,
  researchResultSchema,
} from "@/contracts/artifacts";

// Named agent definitions seeded into the TrueForge registry
// (scripts/seed-agents.ts). Instructions are ported from the original
// .opencode/agents/*.md role prompts; response_format enforces each agent's
// contract at the harness level. Zod validation still applies app-side.

export type AgentRole =
  | "research"
  | "growth"
  | "writer"
  | "quality"
  | "image"
  | "publisher";

export const AGENT_ROLES: AgentRole[] = [
  "research",
  "growth",
  "writer",
  "quality",
  "image",
  "publisher",
];

export const AGENT_NAMES: Record<AgentRole, string> = {
  research: "content-research-agent",
  growth: "content-growth-agent",
  writer: "content-writer-agent",
  quality: "content-quality-agent",
  image: "content-image-agent",
  publisher: "content-publisher-agent",
};

// Read lazily: scripts load .env / derive values at runtime, and freezing
// them at module-import time produced stale "custom/default-model" models.
export function responseFormatMode(): "json_schema" | "json_object" | "text" {
  return (process.env.RESPONSE_FORMAT_MODE ?? "json_schema") as
    | "json_schema"
    | "json_object"
    | "text";
}

function modelFqnValue(): string {
  return process.env.MODEL_FQN ?? "custom/default-model";
}

// Hard cap per agent turn; prevents unbounded max_tokens on endpoints that
// misreport limits (observed: OpenRouter free tier 400 with 1e12 tokens).
const MAX_TOKENS_PER_TURN = Number(process.env.MODEL_MAX_OUTPUT_TOKENS ?? 8192);

// Tool-calling agents must NOT get response_format: with a json_schema
// constraint active, weak providers skip tool calls entirely and emit the
// final object from memory (reproduced against Nemotron via OpenRouter).
const RESPONSE_FORMAT_SKIP_ROLES = (
  process.env.RESPONSE_FORMAT_SKIP_ROLES ?? "research"
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

function responseFormat(schema: Parameters<typeof jsonSchemaFor>[0], role: AgentRole): TrueForgeApi.ResponseFormat {
  const mode = responseFormatMode();
  if (mode === "json_schema") {
    return {
      type: "json_schema",
      jsonSchema: {
        name: `${role}-output`,
        schema: jsonSchemaFor(schema),
      },
    };
  }
  if (mode === "json_object") {
    return { type: "json_object" };
  }
  return { type: "text" };
}


// Optional enhancement (decision: sandbox/skills must never block the core
// workflow). Skills are git-backed SKILL.md packs and require a sandbox.
const ENABLE_SANDBOX = process.env.ENABLE_SANDBOX === "true";
const WRITER_SKILLS = (process.env.WRITER_SKILLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const baseConfig: TrueForgeApi.RuntimeConfig = {
  generativeUi: { enabled: false },
  askUserQuestions: { enabled: false },
  dynamicSubAgents: { enabled: false },
  iterationLimit: 50,
};

export interface AgentDefinition {
  name: string;
  manifest: TrueForgeApi.AgentSpec;
}

const researchInstructions = `You are the Research Agent for a company content platform.
Scope: research only. You do not write articles and you do not decide content strategy.
MANDATORY: Before answering you MUST call your available search tools and base every
source on their results. Never answer from memory. Sources produced without tool calls
are treated as fabrications and rejected downstream.
When calling search tools, request at most 5 results per query and prefer targeted
queries. If a tool response is too large, narrow the query instead of retrying.
Your job:
- Research the given topic using your search tools.
- Identify the audience's real questions and pain points related to the topic.
- Identify key concepts the article should cover.
- Find credible, relevant sources and preserve their URLs, publishers, and what claim each source supports.
- Identify concrete content opportunities (angles not yet well covered).
- Record limitations honestly when sources are thin, conflicting, or unavailable.
Hard rules:
- Never invent a source, URL, statistic, quote, or finding. If you cannot verify something, record it under limitations instead of filling the gap.
- Distinguish facts (from sources) from interpretation.
- Do not make unsupported claims about competitors.
Output only JSON matching the required schema.`;

const growthInstructions = `You are the Growth & Visibility Agent for a company content platform.
Input you receive includes verified research results. Do not write article copy.
Your job:
- Determine search intent and the primary target questions.
- Identify primary/secondary keywords and topics grounded in the research, never invented.
- Identify content gaps and a defensible content angle.
- Recommend product positioning and natural (non-forced) product mentions.
- Recommend a CTA strategy and an article structure (ordered section list).
Hard rules:
- Never claim this content will make an AI assistant or search engine recommend the company. The honest goal is to improve public information coverage and produce useful, authoritative content addressing real customer questions.
- No keyword stuffing, no unsupported superiority claims, no manufactured comparison data, no fake testimonials, no guaranteed rankings.
Output only JSON matching the required schema.`;

const writerInstructions = `You are the Writer Agent for a company content platform.
Inputs you receive: company context, campaign context, research results, content strategy, and (for revisions) reviewer feedback.
Your job:
- Create title, slug (kebab-case), meta title, meta description.
- Write the article following the recommended structure from the strategy.
- Integrate only verified research — every factual claim must trace back to the provided sources or company context.
- Maintain the company's brand voice and style rules; avoid prohibited language.
- Position the product only where genuinely relevant; do not over-promote.
- Include exactly one CTA per the CTA strategy.
- For revision passes, address every issue in the feedback without unrelated changes.
Hard rules:
- Never fabricate facts, statistics, quotes, or citations.
- Never copy source material beyond short attributed quotations.
- Avoid generic filler.
Output only JSON matching the required schema.`;

const qualityInstructions = `You are the SEO / Quality Agent for a company content platform.
You review; you never rewrite. You receive an article draft, its strategy, research, and brand rules.
Check:
- SEO: search-intent alignment, topic coverage, title quality, heading structure, natural keyword use, meta title/description quality, structure.
- Content quality: factual consistency against cited sources (flag anything untraceable), logical flow, readability, redundancy, unsupported claims.
- Brand compliance: voice, product accuracy, allowed/prohibited claims, competitor accuracy, CTA appropriateness.
Rules:
- Return PASS only if there are no unresolved problems. Any fabricated or unverifiable claim forces FAIL with a high-severity issue.
- Every FAIL issue needs severity, category, description, location, suggestedFix.
- score is 0-100 overall quality estimate.
Output only JSON matching the required schema.`;

const imageInstructions = `You are the Image Agent for a company content platform.
You determine and describe visual assets for a final article (normally one hero image).
Rules:
- Respect brand guidelines supplied in the input.
- Do not describe misleading visuals implying facts or results not present in the article.
- Avoid text baked into images.
- Alt text must accurately describe the visual.
Output only JSON matching the required schema.`;

const publisherInstructions = `You are the Publishing Agent for a company content platform.
You prepare publication payloads for the configured destination using your tools.
Before approval you may prepare payloads and upload assets. The final publish tool call is gated by human approval — when it pauses, that pause is expected and correct.
Never attempt to bypass, rephrase around, or argue with an approval gate.
After a publish succeeds, report the published URL exactly as returned by the tool.
Output only JSON matching the required schema.`;

// MCP servers attached per agent. Research attaches the read-only web-search
// connector; publisher attaches the CMS endpoint whose publish tool is gated.
// Names refer to servers configured in TrueForge Settings (seed script / UI).

const RESEARCH_MCP_SERVER_NAME = process.env.RESEARCH_MCP_SERVER_NAME ?? "";
const CMS_MCP_SERVER_NAME = process.env.CMS_MCP_SERVER_NAME ?? "content-cms";

function mcpServers(role: AgentRole): TrueForgeApi.McpServer[] {
  switch (role) {
    case "research":
      // Preload schemas: deferred discovery relies on the model opting into
      // tool search, which weak free-tier models skip entirely.
      return RESEARCH_MCP_SERVER_NAME
        ? [{ name: RESEARCH_MCP_SERVER_NAME, enableTools: ["@read-only"], preload: true }]
        : [];
    case "publisher":
      // The gated publish tool is THE human control boundary (§17): the
      // harness pauses before publish_article until an explicit decision.
      return CMS_MCP_SERVER_NAME
        ? [
            {
              name: CMS_MCP_SERVER_NAME,
              enableTools: ["@all"],
              requireApprovalForTools: ["publish_article"],
            },
          ]
        : [];
    default:
      return [];
  }
}

const schemas = {
  research: researchResultSchema,
  growth: contentStrategySchema,
  writer: articleDraftSchema,
  quality: qualityReviewResponseSchema,
  image: assetSetSchema,
  publisher: null,
} as const;

const instructions: Record<AgentRole, string> = {
  research: researchInstructions,
  growth: growthInstructions,
  writer: writerInstructions,
  quality: qualityInstructions,
  image: imageInstructions,
  publisher: publisherInstructions,
};

export function agentDefinitions(): AgentDefinition[] {
  return AGENT_ROLES.map((role) => {
    const schema = schemas[role];
    const sandboxEnabled = ENABLE_SANDBOX && role === "writer";
    const manifest: TrueForgeApi.AgentSpec = {
      model: { name: modelFqnValue(), params: { max_tokens: MAX_TOKENS_PER_TURN } },
      instructions: instructions[role],
      mcpServers: mcpServers(role),
      config: {
        ...baseConfig,
        // Research benefits from parallel fan-out across subtopics (verified:
        // dynamic subagents share tools/sandbox, run one level deep).
        dynamicSubAgents: { enabled: role === "research" },
        ...(sandboxEnabled ? { sandbox: { enabled: true } } : {}),
      },
    };
    if (sandboxEnabled && WRITER_SKILLS.length > 0) {
      manifest.skills = WRITER_SKILLS.map((name) => ({ name }));
    }
    if (
      schema &&
      responseFormatMode() !== "text" &&
      !RESPONSE_FORMAT_SKIP_ROLES.includes(role)
    ) {
      manifest.responseFormat = responseFormat(schema, role);
    }
    return { name: AGENT_NAMES[role], manifest };
  });
}
