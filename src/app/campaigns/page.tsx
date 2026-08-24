"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CompanySummary = { id: string; name: string };
type Campaign = {
  id: string;
  companyId: string;
  name: string;
  goal?: string;
  topics: string[];
  status: string;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [allRes, coRes] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/companies"),
    ]);
    if (allRes.ok) setCampaigns(await allRes.json());
    if (coRes.ok) setCompanies(await coRes.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIssues([]);
    if (!companyId) {
      setError("Select a company for this campaign");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      goal: goal.trim() || undefined,
      targetAudience: targetAudience.trim() || undefined,
      topics: topicsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error ?? `Request failed (${res.status})`);
        setIssues(body.issues ?? []);
        return;
      }
      setName("");
      setDescription("");
      setGoal("");
      setTargetAudience("");
      setTopicsText("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const statusColor: Record<string, string> = {
    DRAFT: "bg-neutral-800 text-neutral-300",
    ACTIVE: "bg-emerald-900 text-emerald-300",
    COMPLETED: "bg-sky-900 text-sky-300",
    CANCELLED: "bg-red-950 text-red-400",
  };

  const inputClass =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Campaigns</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Group related content around a business objective.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-neutral-800 p-5">
        <div>
          <label className={labelClass} htmlFor="company">Company *</label>
          <select id="company" className={inputClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">— select company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {companies.length === 0 && (
            <p className="mt-1 text-xs text-amber-400">
              No companies yet — create one under Company Context first.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="cname">Name *</label>
            <input id="cname" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="cgoal">Goal</label>
            <input id="cgoal" className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="cdesc">Description</label>
          <textarea id="cdesc" className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="caud">Target audience</label>
          <input id="caud" className={inputClass} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="ctopics">Topics * (one per line)</label>
          <textarea id="ctopics" className={inputClass} rows={3} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} />
        </div>

        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            <p>{error}</p>
            {issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {issues.map((i) => (
                  <li key={`${i.path}-${i.message}`}>{i.path}: {i.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim() || !companyId}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {saving ? "Creating…" : "Create campaign"}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">All campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-neutral-500">No campaigns yet.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between rounded-md border border-neutral-800 p-3 hover:border-neutral-600">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {c.topics.length} topic{c.topics.length === 1 ? "" : "s"}
                      {c.goal ? ` · ${c.goal}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[c.status] ?? ""}`}>
                    {c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
