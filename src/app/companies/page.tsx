"use client";

import { useCallback, useEffect, useState } from "react";

type CompanySummary = {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
};

const LIST_FIELDS = [
  { key: "competitors", label: "Competitors (one per line)" },
  { key: "allowedClaims", label: "Allowed claims (one per line)" },
  { key: "prohibitedClaims", label: "Prohibited claims (one per line)" },
  { key: "contentTypes", label: "Content types (one per line)" },
] as const;

const JSON_FIELDS = [
  {
    key: "products",
    label: "Products (JSON array)",
    placeholder: '[{ "name": "", "description": "", "features": [], "targetUsers": [] }]',
  },
  {
    key: "audience",
    label: "Audience (JSON)",
    placeholder: '{ "primary": [], "secondary": [], "painPoints": [] }',
  },
  {
    key: "brand",
    label: "Brand (JSON)",
    placeholder:
      '{ "voice": "", "tone": "", "styleRules": [], "prohibitedLanguage": [] }',
  },
  {
    key: "marketing",
    label: "Marketing (JSON)",
    placeholder: '{ "goals": [], "valuePropositions": [], "ctas": [] }',
  },
] as const;

type FormState = {
  name: string;
  description: string;
  website: string;
  industry: string;
} & Record<string, string>;

const emptyForm: FormState = {
  name: "",
  description: "",
  website: "",
  industry: "",
  competitors: "",
  allowedClaims: "",
  prohibitedClaims: "",
  contentTypes: "",
  products: "",
  audience: "",
  brand: "",
  marketing: "",
};

function linesToValue(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function valueToLines(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return (value as string[]).join("\n");
}

function jsonToText(value: unknown, fallbackKeys: Record<string, string>): string {
  if (value == null || (typeof value === "object" && Array.isArray(value) && value.length === 0)) {
    return "";
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const isEmpty = Object.values(obj).every(
      (v) => v == null || (Array.isArray(v) && v.length === 0),
    );
    if (isEmpty) return "";
  }
  return JSON.stringify(value, null, 2);
}

function buildPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  payload.name = form.name.trim();
  if (form.description.trim()) payload.description = form.description.trim();
  if (form.website.trim()) payload.website = form.website.trim();
  if (form.industry.trim()) payload.industry = form.industry.trim();
  for (const f of LIST_FIELDS) payload[f.key] = linesToValue(form[f.key]);
  for (const f of JSON_FIELDS) {
    const text = form[f.key].trim();
    if (!text) continue;
    try {
      payload[f.key] = JSON.parse(text);
    } catch {
      throw new Error(`"${f.label}" is not valid JSON`);
    }
  }
  return payload;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const loadCompanies = useCallback(async () => {
    const res = await fetch("/api/companies");
    if (res.ok) setCompanies(await res.json());
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIssues([]);
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid input");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/companies/${editingId}` : "/api/companies",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error ?? `Request failed (${res.status})`);
        setIssues(body.issues ?? []);
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadCompanies();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(company: CompanySummary) {
    const res = await fetch(`/api/companies/${company.id}`);
    if (!res.ok) return;
    const full = await res.json();
    setEditingId(full.id);
    setForm({
      ...emptyForm,
      name: full.name ?? "",
      description: full.description ?? "",
      website: full.website ?? "",
      industry: full.industry ?? "",
      competitors: valueToLines(full.competitors),
      allowedClaims: valueToLines(full.allowedClaims),
      prohibitedClaims: valueToLines(full.prohibitedClaims),
      contentTypes: valueToLines(full.contentTypes),
      products: jsonToText(full.products, {}),
      audience: jsonToText(full.audience, {}),
      brand: jsonToText(full.brand, {}),
      marketing: jsonToText(full.marketing, {}),
    });
    window.scrollTo({ top: 0 });
  }

  const inputClass =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";
  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Company Context</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Persistent source of truth for company facts used by every agent workflow.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-neutral-800 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="name">Name *</label>
            <input id="name" className={inputClass} value={form.name} onChange={set("name")} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="website">Website</label>
            <input id="website" className={inputClass} placeholder="https://example.com" value={form.website} onChange={set("website")} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="description">Description</label>
          <textarea id="description" className={inputClass} rows={2} value={form.description} onChange={set("description")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="industry">Industry</label>
          <input id="industry" className={inputClass} value={form.industry} onChange={set("industry")} />
        </div>

        {LIST_FIELDS.map((f) => (
          <div key={f.key}>
            <label className={labelClass} htmlFor={f.key}>{f.label}</label>
            <textarea id={f.key} className={inputClass} rows={3} value={form[f.key]} onChange={set(f.key)} />
          </div>
        ))}
        {JSON_FIELDS.map((f) => (
          <div key={f.key}>
            <label className={labelClass} htmlFor={f.key}>{f.label}</label>
            <textarea id={f.key} className={`${inputClass} font-mono text-xs`} rows={4} placeholder={f.placeholder} value={form[f.key]} onChange={set(f.key)} />
          </div>
        ))}

        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            <p>{error}</p>
            {issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {issues.map((i) => (
                  <li key={`${i.path}-${i.message}`}>
                    {i.path}: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Create company"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setError(null);
                setIssues([]);
              }}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Saved companies</h2>
        {companies.length === 0 ? (
          <p className="text-sm text-neutral-500">No companies yet.</p>
        ) : (
          <ul className="space-y-2">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border border-neutral-800 p-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-neutral-500">
                    {[c.industry, c.website].filter(Boolean).join(" · ") || "No details"}
                  </p>
                </div>
                <button onClick={() => void handleEdit(c)} className="text-xs text-neutral-400 underline hover:text-neutral-200">
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
