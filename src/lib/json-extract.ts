/**
 * Models frequently wrap JSON in markdown fences or surrounding prose even
 * when a response format is requested (free/open-router tiers are lax about
 * this). Extract the first balanced top-level object before parsing instead
 * of failing on decoration.
 */
function balancedSliceFrom(body: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null; // unbalanced from this start (e.g. stray "{" prefix)
}

/**
 * Every balanced top-level-object candidate in `text`, earliest first.
 * Handles models emitting a stray leading "{" before the real payload
 * (observed with Nemotron via OpenRouter): the first start may be unbalanced,
 * so later "{" positions are tried as well.
 */
export function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  // Strip ```json ... ``` / ``` ... ``` fences when they wrap the payload.
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;

  const candidates: string[] = [];
  for (let idx = body.indexOf("{"); idx !== -1; idx = body.indexOf("{", idx + 1)) {
    const slice = balancedSliceFrom(body, idx);
    if (slice != null && !candidates.includes(slice)) candidates.push(slice);
  }
  return candidates;
}

export function extractJsonCandidate(text: string): string | null {
  return extractJsonCandidates(text)[0] ?? null;
}

/**
 * Parse the most plausible JSON object in `text`. Among all balanced
 * candidates, the LONGEST successful parse wins — the true root payload is
 * always larger than any accidental inner fragment.
 */
export function parseLooseJson(text: string): unknown | null {
  let best: unknown | null = null;
  let bestLength = -1;
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const length = candidate.length;
      if (length > bestLength) {
        best = parsed;
        bestLength = length;
      }
    } catch {
      /* try next candidate */
    }
  }
  return best;
}

export function truncateForLog(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}
