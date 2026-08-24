"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Campaign = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  goal?: string;
  targetAudience?: string;
  topics: string[];
  status: string;
};

const NEXT_ACTIONS: Record<string, { to: string; label: string }[]> = {
  DRAFT: [
    { to: "ACTIVE", label: "Activate" },
    { to: "CANCELLED", label: "Cancel" },
  ],
  ACTIVE: [
    { to: "COMPLETED", label: "Complete" },
    { to: "CANCELLED", label: "Cancel" },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [topicsText, setTopicsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      const c: Campaign = await res.json();
      setCampaign(c);
      setTopicsText(c.topics.join("\n"));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: res.statusText }));
        setError(b.error ?? `Request failed (${res.status})`);
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  function handleSaveTopics() {
    const topics = topicsText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (topics.length === 0) {
      setError("A campaign needs at least one topic");
      return;
    }
    void patch({ topics });
  }

  const editable = campaign?.status === "DRAFT" || campaign?.status === "ACTIVE";

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-neutral-400">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 inline-block text-sm underline">← All campaigns</Link>
      </main>
    );
  }

  if (!campaign) {
    return <main className="mx-auto max-w-3xl p-8 text-neutral-500">Loading…</main>;
  }

  const inputClass =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/campaigns" className="text-sm text-neutral-400 underline">← All campaigns</Link>
      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          {campaign.goal && <p className="mt-1 text-sm text-neutral-400">Goal: {campaign.goal}</p>}
        </div>
        <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">{campaign.status}</span>
      </div>

      {campaign.description && <p className="mt-3 text-sm text-neutral-300">{campaign.description}</p>}
      {campaign.targetAudience && (
        <p className="mt-1 text-sm text-neutral-400">Audience: {campaign.targetAudience}</p>
      )}

      <section className="mt-6 rounded-lg border border-neutral-800 p-5">
        <label className={labelClass} htmlFor="topics">Topics (one per line)</label>
        <textarea
          id="topics"
          className={inputClass}
          rows={4}
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          disabled={!editable}
        />
        <button
          type="button"
          onClick={handleSaveTopics}
          disabled={!editable || saving}
          className="mt-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save topics"}
        </button>

        {error && (
          <p className="mt-2 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>
        )}
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        {(NEXT_ACTIONS[campaign.status] ?? []).map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={saving}
            onClick={() => void patch({ status: a.to })}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-40"
          >
            {a.label} → {a.to}
          </button>
        ))}
      </section>

      <section className="mt-8 rounded-lg border border-dashed border-neutral-800 p-5">
        <h2 className="text-sm font-medium text-neutral-300">Workflow</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Content generation workflow arrives in the orchestration milestone.
        </p>
      </section>
    </main>
  );
}
