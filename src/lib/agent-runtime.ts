import { TrueForge, TrueForgeApi, isEventDelta, mergeEventDelta } from "@truefoundry/trueforge-sdk";
import type { AgentRole } from "@/config/agents";
import { AGENT_NAMES } from "@/config/agents";
import { articleDraftSchema } from "@/contracts/artifacts";

// Narrow port over the agent harness. The application only needs session
// creation, one-shot turns, and approval resumes — never raw model access.

export interface PendingApproval {
  kind: "tool_approval";
  threadId: string;
  toolCallId: string;
  sourceEventId: string;
  toolName: string | null;
  argsPreview: string | null;
}

export interface ActivityItem {
  type: string;
  detail?: string;
}

export interface TurnMetrics {
  totalTokens?: number;
  totalCostUsd?: number;
}

export interface TurnResult {
  status: "done" | "cancelled" | "error";
  outputText: string | null;
  errorMessage?: string;
  pendingApprovals: PendingApproval[];
  activity: ActivityItem[];
  metrics?: TurnMetrics;
  sessionId: string;
  turnId?: string;
  lastSequenceNumber: number;
}

export interface AgentRuntime {
  readonly provider: string;
  createSessionId(role: AgentRole): Promise<string>;
  runUserMessage(sessionId: string, content: string): Promise<TurnResult>;
}

// --- TrueForge implementation -----------------------------------------------

const BASE_URL = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";

export function makeTrueForgeClient() {
  return new TrueForge({
    baseUrl: BASE_URL,
    timeoutInSeconds: 600,
    ...(process.env.TRUEFORGE_TOKEN ? { token: process.env.TRUEFORGE_TOKEN } : {}),
  });
}

export class TrueForgeRuntime implements AgentRuntime {
  readonly provider = "trueforge";
  private readonly client;

  constructor(client = makeTrueForgeClient()) {
    this.client = client;
  }

  async createSessionId(role: AgentRole): Promise<string> {
    const { data } = await this.client.sessions.create({ agent: { name: AGENT_NAMES[role] } });
    return data.id;
  }

  async runUserMessage(sessionId: string, content: string): Promise<TurnResult> {
    const events = new Map<string, TrueForgeApi.TurnStreamingEvent>();
    const activity: ActivityItem[] = [];
    let lastSequenceNumber = 0;
    let turnId: string | undefined;
    let done: Extract<TurnResult, { status: "done" | "cancelled" | "error" }> | null = null;

    const stream = await this.client.sessions.createTurnStream(sessionId, {
      input: [{ type: "user.message", content }],
    });

    for await (const { data: event, id } of stream.withMetadata()) {
      if (id != null && Number(id) > lastSequenceNumber) lastSequenceNumber = Number(id);
      if (event.type === "turn.created") turnId = event.turnId;

      if (isEventDelta(event)) {
        const base = events.get(event.id);
        if (base) mergeEventDelta(base, event);
        continue;
      }
      events.set(event.id, event);

      if (event.type === "thread.created") {
        activity.push({ type: "subagent_started", detail: event.title });
      } else if (event.type === "tool.response") {
        activity.push({ type: "tool_response", detail: truncate(String(event.content ?? ""), 160) });
      } else if (event.type === "sandbox.created") {
        activity.push({ type: "sandbox_created", detail: event.sandboxId });
      } else if (event.type === "turn.done") {
        const s = event.state;
        if (s.status === "done") {
          const outputMessage =
            s.output && s.output.type === "model.message" ? s.output : mainThreadFinal(events);
          const requiredActions = collectApprovals(s.requiredActions ?? [], events);
          done = {
            status: "done",
            outputText: extractText(outputMessage?.content ?? null),
            pendingApprovals: requiredActions,
            activity,
            sessionId,
            turnId,
            lastSequenceNumber,
            metrics: normalizeMetrics(s.metrics),
          };
        } else if (s.status === "cancelled") {
          done = { status: "cancelled", outputText: null, errorMessage: `cancelled: ${s.reason}`, pendingApprovals: [], activity, sessionId, turnId, lastSequenceNumber };
        } else {
          done = { status: "error", outputText: null, errorMessage: s.message, pendingApprovals: [], activity, sessionId, turnId, lastSequenceNumber };
        }
      }
    }

    return (
      done ?? { status: "error", outputText: null, errorMessage: "stream ended without turn.done", pendingApprovals: [], activity, sessionId, turnId, lastSequenceNumber }
    );
  }
}

function mainThreadFinal(
  events: Map<string, TrueForgeApi.TurnStreamingEvent>,
): { content: string | unknown[] | null } | null {
  let last: { content: string | unknown[] | null } | null = null;
  for (const e of events.values()) {
    if (e.type === "model.message" && e.threadId === "main") {
      const hasToolCalls = Array.isArray(e.toolCalls) && e.toolCalls.length > 0;
      if (!hasToolCalls) {
        last = { content: e.content ?? null };
      }
    }
  }
  return last;
}

// model.message content may be a plain string or an array of typed parts.
function extractText(content: string | unknown[] | null): string | null {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p != null && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  }
  return null;
}

type RequiredActionLike = { type?: string; thread_id?: string; tool_calls?: { id: string; source_event_id: string }[] };

function collectApprovals(requiredActions: unknown[], events: Map<string, TrueForgeApi.TurnStreamingEvent>): PendingApproval[] {
  const approvals: PendingApproval[] = [];
  for (const ra of requiredActions as RequiredActionLike[]) {
    if (ra.type !== "tool.approval_required") continue;
    for (const ref of ra.tool_calls ?? []) {
      const msg = events.get(ref.source_event_id);
      let toolName: string | null = null;
      let argsPreview: string | null = null;
      if (msg?.type === "model.message") {
        const call = msg.toolCalls?.find((tc) => tc.id === ref.id);
        if (call) {
          toolName = call.toolInfo?.name ?? call.function?.name ?? null;
          argsPreview = call.function?.arguments ?? null;
        }
      }
      approvals.push({
        kind: "tool_approval",
        threadId: String(ra.thread_id ?? "main"),
        toolCallId: ref.id,
        sourceEventId: ref.source_event_id,
        toolName,
        argsPreview: argsPreview ? truncate(argsPreview, 400) : null,
      });
    }
  }
  return approvals;
}

function normalizeMetrics(m: unknown): TurnMetrics | undefined {
  if (!m || typeof m !== "object") return undefined;
  const rec = m as Record<string, unknown>;
  return {
    totalTokens: typeof rec.total_tokens === "number" ? rec.total_tokens : undefined,
    totalCostUsd: typeof rec.total_cost_in_usd === "number" ? rec.total_cost_in_usd : undefined,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

// --- Mock implementation -----------------------------------------------------

export interface MockScriptEntry {
  /** Override the fixture output text for a given call index. */
  overrideOutputText?: (callIndex: number) => string | null;
  /** Force an error result instead of returning output. */
  failCallIndexes?: number[];
}

export class MockAgentRuntime implements AgentRuntime {
  readonly provider = "mock";
  private counter = 0;
  private sessionsByRole = new Map<AgentRole, string[]>();
  private callsPerSession = new Map<string, number>();

  constructor(private readonly scriptForRole: (role: AgentRole) => MockScriptEntry = () => ({})) {}

  async createSessionId(role: AgentRole): Promise<string> {
    const sessionId = `mock-sess-${role}-${++this.counter}`;
    const list = this.sessionsByRole.get(role) ?? [];
    list.push(sessionId);
    this.sessionsByRole.set(role, list);
    this.callsPerSession.set(sessionId, 0);
    return sessionId;
  }

  async runUserMessage(sessionId: string, _content: string): Promise<TurnResult> {
    const role = sessionIdToRole(sessionId);
    const callIndex = this.callsPerSession.get(sessionId) ?? 0;
    this.callsPerSession.set(sessionId, callIndex + 1);

    const script = this.scriptForRole(role);
    if (script.failCallIndexes?.includes(callIndex)) {
      return {
        status: "error",
        outputText: null,
        errorMessage: `mock provider failure for ${role}`,
        pendingApprovals: [],
        activity: [],
        sessionId,
        turnId: `${sessionId}-turn-${callIndex}`,
        lastSequenceNumber: 2,
      };
    }
    const overridden = script.overrideOutputText?.(callIndex);
    return {
      status: "done",
      outputText: overridden ?? JSON.stringify(fixtureOutput(role)),
      pendingApprovals: [],
      activity: [{ type: "tool_response", detail: "(mock)" }],
      sessionId,
      turnId: `${sessionId}-turn-${callIndex}`,
      lastSequenceNumber: 2,
      metrics: { totalTokens: 1000, totalCostUsd: 0.001 },
    };
  }
}

function sessionIdToRole(sessionId: string): AgentRole {
  const m = sessionId.match(/^mock-sess-([a-z]+)-/);
  if (!m || !AGENT_NAMES[m[1] as AgentRole]) {
    throw new Error(`unknown mock session ${sessionId}`);
  }
  return m[1] as AgentRole;
}

export function fixtureOutput(role: AgentRole): unknown {
  switch (role) {
    case "research":
      return {
        topic: "Vector databases for product analytics",
        searchIntent: "informational",
        audienceQuestions: ["Which vector DB fits embedded analytics?"],
        painPoints: ["High query latency at scale"],
        keyPoints: ["ANN indexes trade recall for speed"],
        sources: [
          {
            title: "Benchmarking vector search",
            url: "https://example.com/benchmark",
            publisher: "Example Research",
            relevance: "Latency comparisons across ANN implementations",
            claimsSupported: ["HNSW offers lower latency at high recall"],
          },
        ],
        contentOpportunities: ["Few practical guides for embedded use"],
        limitations: ["No public pricing data available"],
      };
    case "growth":
      return {
        primaryTopic: "Choosing a vector database for product analytics",
        searchIntent: "commercial investigation",
        targetQuestions: ["What latency can I expect?", "How does licensing compare?"],
        primaryKeywords: ["vector database", "product analytics"],
        secondaryTopics: ["ANN indexing"],
        contentAngle: "Practical buyer's guide grounded in benchmarks",
        productPositioning: "Mention Pulse as an embedded-analytics consumer of vector search where relevant",
        ctaStrategy: "Single CTA: book a demo",
        recommendedStructure: [
          "Why vector search matters in analytics",
          "Key selection criteria",
          "Comparison overview",
          "Getting started",
        ],
        contentGaps: ["Licensing details often missing"],
      };
    case "writer":
      return articleDraftSchema.parse({
        title: "Choosing a Vector Database for Product Analytics",
        slug: "choosing-a-vector-database-for-product-analytics",
        metaTitle: "Vector Databases for Product Analytics: A Practical Guide",
        metaDescription: "Selection criteria, latency trade-offs, and licensing notes for teams adding vector search to analytics.",
        content: `# Choosing a Vector Database\n\nVector search has become central to modern product analytics.\n\n## Why it matters\n\nTeams need fast similarity search over embeddings generated from user behavior.\n\n## Selection criteria\n\nBenchmarks show HNSW indexes offer lower latency at high recall, according to Example Research's benchmark.\n\n## Getting started\n\nStart with query-latency requirements, then evaluate licensing and operational overhead.\n\nReady to see it applied to your funnel? Book a demo.`,
        headings: ["Why it matters", "Selection criteria", "Getting started"],
        cta: "Book a demo",
        sources: [
          {
            title: "Benchmarking vector search",
            url: "https://example.com/benchmark",
            publisher: "Example Research",
            relevance: "Latency claims",
            claimsSupported: ["HNSW offers lower latency at high recall"],
          },
        ],
      });
    case "quality":
      return { status: "PASS", score: 88, recommendations: ["Consider internal links"] };
    case "image":
      return {
        assets: [
          {
            type: "hero",
            url: "https://placehold.co/1200x630/0a0a0a/ededed?text=Vector+Search",
            altText: "Abstract visualization of vector similarity search",
            description: "Hero illustration of embedding clusters",
          },
        ],
      };
    case "publisher":
      return { publishedUrl: "https://blog.example.com/mock-article", externalId: "mock-123" };
  }
}
