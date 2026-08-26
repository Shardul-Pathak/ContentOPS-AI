import type { AgentRole } from "@/config/agents";
import {
  articleDraftSchema,
  assetSetSchema,
  contentStrategySchema,
  parseQualityReviewOutput,
  publishPayloadSchema,
  qualityReviewSchema,
  researchResultSchema,
  type ArticleDraft,
  type AssetSet,
  type ContentStrategy,
  type PublishPayload,
  type QualityReview,
  type ResearchResult,
} from "@/contracts/artifacts";
import { companyContextInputSchema } from "@/contracts/company-context";
import { NotFoundError } from "@/services/companies";
import { MAX_REVISIONS, isTerminal, nextStatus, type WorkflowStatus } from "@/domain/state-machine";
import { Prisma } from "@prisma/client";
import { parseLooseJson, truncateForLog } from "@/lib/json-extract";
import { prisma } from "@/lib/db";
import {
  MockAgentRuntime,
  TrueForgeRuntime,
  type ActivityItem,
  type ActivitySink,
  type AgentRuntime,
  type TurnResult,
} from "@/lib/agent-runtime";

// Application-side orchestration per AGENTS.md sections 6/9/14: business
// sequencing and workflow-state ownership live here; all agent execution
// lives in the harness (TrueForge or the mock runtime).

export function getAgentRuntime(): AgentRuntime {
  return process.env.AGENT_PROVIDER === "trueforge"
    ? new TrueForgeRuntime()
    : new MockAgentRuntime();
}

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

async function setStatus(
  contentId: string,
  status: WorkflowStatus,
  currentAgent?: string | null,
): Promise<void> {
  await prisma.content.update({
    where: { id: contentId },
    data: { status, ...(currentAgent !== undefined ? { currentAgent } : {}) },
  });
}

interface StageContext {
  contentId: string;
  runtime: AgentRuntime;
}

interface StageOutcome<T> {
  artifact: T;
  runId: string;
  activity: ActivityItem[];
}

const validators: Partial<Record<AgentRole, (text: string) => unknown>> = {
  research: zodOutputParser(researchResultSchema),
  growth: zodOutputParser(contentStrategySchema),
  writer: zodOutputParser(articleDraftSchema),
  // Quality output may arrive enveloped ({ "review": ... }) or bare — the
  // envelope is required by OpenAI-compatible response_format constraints.
  quality: parseQualityReviewOutput,
  image: zodOutputParser(assetSetSchema),
  publisher: zodOutputParser(publishPayloadSchema),
};

interface ZodLike {
  safeParse(input: unknown):
    | { success: true; data: unknown }
    | { success: false; error: unknown };
}

// Tolerant of markdown fences / surrounding prose before schema validation.
function zodOutputParser(schema: ZodLike): (text: string) => unknown {
  return (text) => {
    const json = parseLooseJson(text);
    if (json == null) return null;
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : null;
  };
}

function parseArtifact(role: AgentRole, text: string | null): unknown | null {
  if (text == null) return null;
  return validators[role]?.(text) ?? null;
}

// Transient-429 handling: free OpenRouter tiers cap requests per minute and a
// research turn easily exceeds that. Retry the SAME session after a wait —
// prior tool results stay in session context, so the agent resumes cleanly.
const RATE_LIMIT_MAX_RETRIES = Number(process.env.RATE_LIMIT_MAX_RETRIES ?? 4);
const RATE_LIMIT_BASE_DELAY_MS = () =>
  Number(process.env.RATE_LIMIT_BASE_DELAY_MS ?? 20000);

function rateLimitDelayMs(attempt: number): number {
  // 20s, 40s, 80s, 160s …
  return RATE_LIMIT_BASE_DELAY_MS() * Math.pow(2, attempt);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function invokeTurnWithRateLimitRetry(
  invokeInitial: () => Promise<TurnResult>,
  invokeRetry: () => Promise<TurnResult>,
  onActivity?: (item: ActivityItem) => void,
): Promise<TurnResult> {
  let result = await invokeInitial();
  let attempt = 0;
  while (result.status === "error" && result.rateLimited && !result.dailyQuotaExhausted && attempt < RATE_LIMIT_MAX_RETRIES) {
    const delay = rateLimitDelayMs(attempt);
    attempt++;
    onActivity?.({
      type: "rate_limit_retry",
      detail: `429 received — waiting ${Math.round(delay / 1000)}s before continuing (attempt ${attempt}/${RATE_LIMIT_MAX_RETRIES})`,
    });
    await sleep(delay);
    result = await invokeRetry();
  }
  return result;
}

async function runStage<A>(
  ctx: StageContext,
  role: AgentRole,
  statusDuringStage: WorkflowStatus,
  prompt: string,
): Promise<StageOutcome<A>> {
  const { contentId, runtime } = ctx;

  const run = await prisma.agentRun.create({
    data: { contentId, agentRole: role, attempt: await currentAttempt(contentId), status: "RUNNING" },
  });
  await setStatus(contentId, statusDuringStage, role);

  // Live progress: persist harness activity while the turn runs so the
  // polling UI shows tool calls in real time (debounced to limit writes).
  let liveActivity: ActivityItem[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushActivity = () => {
    if (liveActivity.length === 0) return;
    const snapshot = liveActivity;
    void prisma.agentRun
      .update({ where: { id: run.id }, data: { activity: asJson(snapshot) } })
      .catch(() => {});
    flushTimer = null;
  };
  const onActivity: ActivitySink = (item) => {
    liveActivity = [...liveActivity, item];
    if (!flushTimer) flushTimer = setTimeout(flushActivity, 800);
  };
  const stopFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  try {
    const sessionId = await runtime.createSessionId(role);
    const continuePrompt =
      "You were interrupted by a temporary provider rate limit. Continue your task exactly where you left off.";
    let result = await invokeTurnWithRateLimitRetry(
      () => runtime.runUserMessage(sessionId, prompt, onActivity),
      () => runtime.runUserMessage(sessionId, continuePrompt, onActivity),
      onActivity,
    );

    // One corrective retry when the model returns unparseable output
    // (AGENTS.md section 23: retry only when safe).
    if (result.status === "done" && parseArtifact(role, result.outputText) == null) {
      result = await runtime.runUserMessage(
        sessionId,
        "Your previous response was not valid JSON for the required schema. Respond again with ONLY the JSON object.",
      );
    }

    const artifact =
      result.status === "done" ? (parseArtifact(role, result.outputText) as A | null) : null;

    if (!artifact) {
      if (result.dailyQuotaExhausted) {
        throw new WorkflowError(
          `Provider daily free quota exhausted mid-${role}. Add credits on the provider dashboard or switch MODEL_UPSTREAM_MODEL.`,
        );
      }
      const detail =
        result.status !== "done"
          ? (result.errorMessage ?? "harness error")
          : `output was not valid JSON for the ${role} contract after one corrective retry — began with: "${truncateForLog(result.outputText ?? "")}"`;
      throw new WorkflowError(`Agent ${role} did not produce a valid result: ${detail}`);
    }

    // Merge streamed live activity (incl. retry markers) with the turn's own
    // final list; sink items are a superset for both runtimes.
    const finalActivity =
      liveActivity.length > 0
        ? [
            ...liveActivity,
            ...result.activity.filter(
              (a) => !liveActivity.some((b) => b.type === a.type && b.detail === a.detail),
            ),
          ]
        : result.activity;

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        trueforgeSessionId: sessionId,
        trueforgeTurnId: result.turnId,
        lastSequenceNumber: result.lastSequenceNumber,
        activity: asJson(finalActivity),
        output: asJson(artifact),
        metrics: result.metrics ? asJson(result.metrics) : undefined,
        finishedAt: new Date(),
      },
    });
    return { artifact, runId: run.id, activity: result.activity };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    throw err;
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function currentAttempt(contentId: string): Promise<number> {
  const c = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
  // attempt = revision cycle number this run belongs to (1-based).
  return c.revisionCount + 1;
}

function companyBrief(company: {
  name: string;
  description?: string | null;
  website?: string | null;
  industry?: string | null;
}): string {
  return [
    `Company: ${company.name}`,
    company.description ? `Description: ${company.description}` : "",
    company.website ? `Website: ${company.website}` : "",
    company.industry ? `Industry: ${company.industry}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Creates the Content row synchronously and runs the pipeline in the
 * background. Callers respond with the content id and poll its status.
 */
export async function startWorkflow(campaignId: string, topic: string): Promise<string> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign not found");

  const content = await prisma.content.create({
    data: { campaignId, topic, status: "CREATED" },
  });

  void runWorkflow(content.id).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.content.updateMany({
      where: { id: content.id, status: { notIn: ["PUBLISHED", "CANCELLED"] } },
      data: { status: "FAILED", failureReason: message },
    });
  });

  return content.id;
}

export async function runWorkflow(
  contentId: string,
  runtimeOverride?: AgentRuntime,
): Promise<void> {
  try {
    const runtime = runtimeOverride ?? getAgentRuntime();
    const ctx: StageContext = { contentId, runtime };

    const loadContent = () =>
      prisma.content.findUniqueOrThrow({
        where: { id: contentId },
        include: { campaign: { include: { company: true } } },
      });

    let content = await loadContent();
    const { campaign } = content;
    const company = campaign.company;

    // --- VALIDATING ---------------------------------------------------------
    await setStatus(contentId, "VALIDATING", "orchestrator");
    const contextCheck = companyContextInputSchema.safeParse(company);
    if (!contextCheck.success) {
      throw new WorkflowError("Company context failed validation: " + contextCheck.error.issues[0]?.message);
    }
    const parsedCompany = contextCheck.data;
    const audience =
      (parsedCompany.audience.primary?.length ?? 0) > 0 ||
      (parsedCompany.audience.painPoints?.length ?? 0) > 0;
    if (!audience) {
      throw new WorkflowError(
        "Company context incomplete for workflow: primary audience segments or pain points are required",
      );
    }

    // --- RESEARCHING --------------------------------------------------------
    const researchOutcome = await runStage<ResearchResult>(
      ctx,
      "research",
      "RESEARCHING",
      [
        "Research the following topic for a company blog article.",
        companyBrief(company),
        `Campaign: ${campaign.name}${campaign.goal ? ` (goal: ${campaign.goal})` : ""}`,
        `Target audience: ${campaign.targetAudience ?? parsedCompany.audience.primary.join(", ")}`,
        `Topic: ${content.topic}`,
        "Use your search tools to find credible sources. Preserve exact URLs and publishers. Return ONLY JSON matching the required schema.",
      ].join("\n\n"),
    );
    await prisma.content.update({
      where: { id: contentId },
      data: { research: asJson(researchOutcome.artifact) },
    });

    // Tool-use gate (AGENTS.md sections 4.3/23): sources claimed without a
    // single search-tool call are hallucinations — refuse them outright.
    const r = researchOutcome.artifact;
    const searchCalls = researchOutcome.activity.filter((a) => a.type === "tool_response").length;
    if (searchCalls === 0 && r.sources.length > 0) {
      throw new WorkflowError(
        `Research cited ${r.sources.length} sources without performing any search tool calls — refusing unverifiable citations.`,
      );
    }

    // Evidence gate (AGENTS.md section 4.3): honest limitations are fine, but
    // a run with zero usable evidence would only produce a fabricated-feeling
    // article downstream — stop here instead of writing one.
    if (
      r.sources.length === 0 &&
      r.keyPoints.length === 0 &&
      r.audienceQuestions.length === 0
    ) {
      throw new WorkflowError(
        `Research produced no usable evidence for "${r.topic}" (${r.limitations.join("; ") || "no limitations recorded"}). Attach a search connector to the research agent or choose a different topic.`,
      );
    }

    // Durable provenance: one row per verified source (§10 — preserve metadata).
    await prisma.researchSource.deleteMany({ where: { contentId } });
    if (researchOutcome.artifact.sources.length > 0) {
      await prisma.researchSource.createMany({
        data: researchOutcome.artifact.sources.map((s) => ({
          contentId,
          url: s.url,
          title: s.title,
          publisher: s.publisher,
          relevance: s.relevance,
          claimsSupported: asJson(s.claimsSupported),
        })),
      });
    }
    await setStatus(contentId, "STRATEGIZING", "research");

    // --- STRATEGIZING -------------------------------------------------------
    const strategyOutcome = await runStage<ContentStrategy>(
      ctx,
      "growth",
      "STRATEGIZING",
      [
        "Create a content strategy from the verified research below. Do not invent facts beyond it.",
        companyBrief(company),
        `Value propositions: ${(company.marketing as { valuePropositions?: string[] } | null)?.valuePropositions?.join("; ") ?? "none provided"}`,
        `Research:\n${JSON.stringify(researchOutcome.artifact)}`,
      ].join("\n\n"),
    );
    await prisma.content.update({
      where: { id: contentId },
      data: { strategy: asJson(strategyOutcome.artifact) },
    });
    await setStatus(contentId, "WRITING", "growth");

    // --- WRITING / REVIEWING / REVISING -------------------------------------
    let revisionFeedback: {
      issues: QualityReview["issues"];
      recommendations: string[];
    } | null = null;

    let lastDraft: ArticleDraft | null = null;

    for (;;) {
      const writerInput: Record<string, unknown> = {
        company: {
          name: company.name,
          brand: company.brand,
          marketing: company.marketing,
          allowedClaims: company.allowedClaims,
          prohibitedClaims: company.prohibitedClaims,
          audience: company.audience,
        },
        campaign: {
          name: campaign.name,
          goal: campaign.goal,
          targetAudience: campaign.targetAudience,
        },
        topic: content.topic,
        research: researchOutcome.artifact,
        strategy: strategyOutcome.artifact,
      };
      if (revisionFeedback) writerInput.revisionFeedback = revisionFeedback;

      const writeResult: { artifact: ArticleDraft; runId: string } = await runStage<ArticleDraft>(
        ctx,
        "writer",
        revisionFeedback ? "REVISING" : "WRITING",
        [
          "Write the article now. Return ONLY JSON matching the required schema.",
          `Input:\n${JSON.stringify(writerInput)}`,
        ].join("\n\n"),
      );
      const draft = writeResult.artifact;
      lastDraft = draft;
      await prisma.content.update({ where: { id: contentId }, data: { draft: asJson(draft) } });

      const reviewResult: { artifact: QualityReview; runId: string } = await runStage<QualityReview>(
        ctx,
        "quality",
        "REVIEWING",
        [
          "Review the following article draft for SEO, content quality, and brand compliance. Return PASS or FAIL JSON only — do not rewrite the article.",
          `Brand rules: ${JSON.stringify({
            allowedClaims: company.allowedClaims,
            prohibitedClaims: company.prohibitedClaims,
            brand: company.brand,
          })}`,
          `Research sources: ${JSON.stringify(
            researchOutcome.artifact.sources.map((s) => ({
              url: s.url,
              claimsSupported: s.claimsSupported,
            })),
          )}`,
          `Strategy: ${JSON.stringify(strategyOutcome.artifact)}`,
          `Draft:\n${JSON.stringify(draft)}`,
        ].join("\n\n"),
      );
      const review = reviewResult.artifact;
      await prisma.content.update({
        where: { id: contentId },
        data: { qualityReview: asJson(review) },
      });

      if (review.status === "PASS") break;

      // Revision loop guard (AGENTS.md section 14). Count lives on the row
      // and never exceeds MAX_REVISIONS.
      const fresh = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
      const next = nextStatus(fresh.status as WorkflowStatus, {
        type: "REVIEW_FAIL",
        revisionCount: fresh.revisionCount,
      });
      await prisma.content.update({
        where: { id: contentId },
        data: {
          revisionCount: Math.min(fresh.revisionCount + 1, MAX_REVISIONS),
          status: next,
          currentAgent: null,
        },
      });

      if (next === "REQUIRES_HUMAN_INTERVENTION") {
        await prisma.content.update({
          where: { id: contentId },
          data: {
            failureReason: `Quality review failed after MAX_REVISIONS=${MAX_REVISIONS}: ${review.issues
              .map((i) => `${i.severity}: ${i.description}`)
              .join(" | ")}`,
          },
        });
        return;
      }

      revisionFeedback = {
        issues: review.issues,
        recommendations: review.recommendations,
      };
    }

    // --- ASSETS -------------------------------------------------------------
    const assetsOutcome = await runStage<AssetSet>(
      ctx,
      "image",
      "GENERATING_ASSETS",
      [
        "Determine visual assets for the final article below. Return ONLY JSON matching the required schema.",
        `Brand notes: ${JSON.stringify(company.brand)}`,
        `Article title: ${lastDraft?.title ?? content.topic}\nTopic: ${content.topic}\nOpening excerpt: ${(lastDraft?.content ?? "").slice(0, 400)}`,
      ].join("\n\n"),
    );
    await prisma.asset.deleteMany({ where: { contentId } });
    if (assetsOutcome.artifact.assets.length > 0) {
      await prisma.asset.createMany({
        data: assetsOutcome.artifact.assets.map((a) => ({
          contentId,
          type: a.type,
          url: a.url,
          altText: a.altText,
          description: a.description,
        })),
      });
    }

    // --- PUBLICATION + APPROVAL GATE -----------------------------------------
    // The publisher prepares AND submits via its tools; the gated publish tool
    // pauses the turn (TrueForge HITL). Execution only happens later through
    // decideApproval() resuming THIS session with the human's decision (§17).
    await setStatus(contentId, "AWAITING_APPROVAL", "publisher");
    const assets = await prisma.asset.findMany({ where: { contentId } });
    const publisherRun = await prisma.agentRun.create({
      data: { contentId, agentRole: "publisher", attempt: 1, status: "RUNNING" },
    });

    const sessionId = await runtime.createSessionId("publisher");
    const result = await runtime.runUserMessage(
      sessionId,
      [
        "Prepare and submit this article for publication using your tools.",
        `Article title: ${lastDraft?.title ?? content.topic}`,
        `Slug: ${lastDraft?.slug ?? ""}`,
        `Meta description: ${lastDraft?.metaDescription ?? ""}`,
        `Assets prepared: ${assets.length}`,
        "The final publish tool call is gated by human approval. When the turn pauses at that gate, stop and wait.",
      ].join("\n\n"),
    );

    if (result.pendingApprovals.length === 0 || !result.turnId) {
      // Safety invariant: publishing must NEVER proceed without a gate.
      await prisma.agentRun.update({
        where: { id: publisherRun.id },
        data: {
          status: "FAILED",
          error: "publisher finished without pausing at the approval gate",
          trueforgeSessionId: sessionId,
          finishedAt: new Date(),
        },
      });
      throw new WorkflowError("Publisher did not pause at the approval gate — refusing to proceed");
    }

    const pending = result.pendingApprovals[0];
    await prisma.agentRun.update({
      where: { id: publisherRun.id },
      data: {
        trueforgeSessionId: sessionId,
        trueforgeTurnId: result.turnId,
        lastSequenceNumber: result.lastSequenceNumber,
        activity: asJson(result.activity),
        metrics: result.metrics ? asJson(result.metrics) : undefined,
      },
    });
    await prisma.approval.create({
      data: {
        contentId,
        status: "PENDING",
        destination: `${pending.toolName ?? "publish_article"} @ company blog`,
        payloadSummary: asJson({
          destination: "company-blog",
          title: lastDraft?.title ?? content.topic,
          slug: lastDraft?.slug ?? "",
          metaDescription: lastDraft?.metaDescription ?? "",
          assetCount: assets.length,
          externalAction:
            `${pending.toolName ?? "publish_article"}(${pending.argsPreview ?? "{}"}) — publishes the article to the configured company endpoint`,
        }),
        tfSessionId: sessionId,
        tfTurnId: result.turnId,
        toolCallId: pending.toolCallId,
        threadId: pending.threadId,
      },
    });
    await setStatus(contentId, "AWAITING_APPROVAL", null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const existing = await prisma.content.findUnique({ where: { id: contentId } });
    if (!existing || !isTerminal(existing.status as WorkflowStatus)) {
      await prisma.content.update({
        where: { id: contentId },
        data: { status: "FAILED", failureReason: message, currentAgent: null },
      });
    }
    throw err;
  }
}
