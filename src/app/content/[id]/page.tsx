"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type AgentRun = {
  id: string;
  agentRole: string;
  attempt: number;
  status: string;
  activity: { type: string; detail?: string }[] | null;
  error: string | null;
  metrics: { totalTokens?: number; totalCostUsd?: number } | null;
  startedAt: string;
  finishedAt: string | null;
};

type ContentState = {
  id: string;
  topic: string;
  status: string;
  currentAgent: string | null;
  revisionCount: number;
  failureReason: string | null;
  draft: {
    title?: string;
    metaDescription?: string;
    content?: string;
    cta?: string;
  } | null;
  qualityReview: { status?: string; score?: number; issues?: { severity: string; description: string }[] } | null;
  assets: { assets?: { type: string; url: string; altText: string }[] } | null;
  campaignId: string;
  agentRuns: AgentRun[];
};

const TERMINAL_OR_WAITING = new Set([
  "AWAITING_APPROVAL",
  "PUBLISHED",
  "FAILED",
  "REQUIRES_HUMAN_INTERVENTION",
  "CANCELLED",
]);

const STATUS_STEPS = [
  "VALIDATING",
  "RESEARCHING",
  "STRATEGIZING",
  "WRITING",
  "REVIEWING",
  "GENERATING_ASSETS",
  "AWAITING_APPROVAL",
];

export default function ContentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [content, setContent] = useState<ContentState | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/contents/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    if (res.ok) {
      const data: ContentState = await res.json();
      setContent(data);
      return data;
    }
    return null;
  }, [id]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      const data = await load();
      if (!data || TERMINAL_OR_WAITING.has(data.status)) {
        if (interval) clearInterval(interval);
      }
    };
    void tick();
    interval = setInterval(tick, 2000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [load]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-neutral-400">Content not found.</p>
        <Link href="/campaigns" className="mt-4 inline-block text-sm underline">← All campaigns</Link>
      </main>
    );
  }

  if (!content) {
    return <main className="mx-auto max-w-3xl p-8 text-neutral-500">Loading…</main>;
  }

  const currentStepIndex =
    content.currentAgent == null && TERMINAL_OR_WAITING.has(content.status)
      ? -1
      : STATUS_STEPS.indexOf(content.status);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/campaigns/${content.campaignId}`} className="text-sm text-neutral-400 underline">
        ← Campaign
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{content.draft?.title ?? content.topic}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Status: <span className="font-mono">{content.status}</span>
        {content.revisionCount > 0 ? ` · revisions: ${content.revisionCount}` : ""}
        {content.currentAgent ? ` · agent: ${content.currentAgent}` : ""}
      </p>

      {/* Workflow progress timeline */}
      <section className="mt-6 rounded-lg border border-neutral-800 p-5">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Workflow progress</h2>
        <ol className="space-y-2 text-sm">
          {STATUS_STEPS.map((step) => {
            const idx = STATUS_STEPS.indexOf(step);
            const done = currentStepIndex > idx || TERMINAL_OR_WAITING.has(content.status);
            const active = idx === currentStepIndex;
            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    done
                      ? "bg-emerald-500"
                      : active
                        ? "animate-pulse bg-sky-400"
                        : "bg-neutral-700"
                  }`}
                />
                <span className={active ? "text-sky-300" : done ? "text-neutral-200" : "text-neutral-600"}>
                  {step}
                </span>
              </li>
            );
          })}
        </ol>
        {content.failureReason && (
          <p className="mt-3 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {content.failureReason}
          </p>
        )}
        {content.status === "AWAITING_APPROVAL" && (
          <p className="mt-3 rounded-md border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-300">
            Awaiting approval. Publishing controls arrive with the approval gate milestone.
          </p>
        )}
      </section>

      {/* Agent execution history */}
      <section className="mt-6 space-y-2">
        <h2 className="text-lg font-medium">Agent runs</h2>
        {content.agentRuns.length === 0 && (
          <p className="text-sm text-neutral-500">No agent runs yet.</p>
        )}
        {content.agentRuns.map((run) => (
          <div key={run.id} className="rounded-md border border-neutral-800 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">
                {run.agentRole} <span className="text-xs text-neutral-500">attempt {run.attempt}</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  run.status === "DONE"
                    ? "bg-emerald-900 text-emerald-300"
                    : run.status === "RUNNING"
                      ? "bg-sky-900 text-sky-300"
                      : "bg-red-950 text-red-400"
                }`}
              >
                {run.status}
              </span>
            </div>
            {run.activity && run.activity.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-neutral-500">
                {run.activity.slice(0, 6).map((a, i) => (
                  <li key={i}>
                    {a.type}
                    {a.detail ? `: ${a.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {run.metrics?.totalCostUsd != null && (
              <p className="mt-1 text-xs text-neutral-600">
                tokens: {run.metrics.totalTokens ?? "?"} · cost: ${run.metrics.totalCostUsd.toFixed(4)}
              </p>
            )}
            {run.error && <p className="mt-1 text-xs text-red-400">{run.error}</p>}
          </div>
        ))}
      </section>

      {/* Review + artifacts */}
      {content.qualityReview?.status === "FAIL" && content.qualityReview.issues && (
        <section className="mt-6 rounded-lg border border-red-900 p-5 text-sm">
          <h2 className="mb-2 font-medium">Last review issues</h2>
          <ul className="list-disc space-y-1 pl-5 text-neutral-300">
            {content.qualityReview.issues.map((i, idx) => (
              <li key={idx}>
                <span className="uppercase text-xs">{i.severity}</span> — {i.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.assets?.assets && content.assets.assets.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-medium">Assets</h2>
          {content.assets.assets.map((a, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={a.url} alt={a.altText} className="max-h-56 rounded-md border border-neutral-800" />
          ))}
        </section>
      )}

      {content.draft?.content && (
        <section className="mt-6 rounded-lg border border-neutral-800 p-5">
          <h2 className="mb-2 text-lg font-medium">Draft</h2>
          <article className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {content.draft.content}
          </article>
        </section>
      )}
    </main>
  );
}
