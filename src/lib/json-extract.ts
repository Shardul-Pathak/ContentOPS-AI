/**
 * Models frequently wrap JSON in markdown fences or surrounding prose even
 * when a response format is requested (free/open-router tiers are lax about
 * this). Extract the first balanced top-level object before parsing instead
 * of failing on decoration.
 */
export function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // Strip ```json ... ``` / ``` ... ``` fences when they wrap the payload.
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;

  const start = body.indexOf("{");
  if (start === -1) return null;

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
  return null;
}

/** Parse the first JSON object found in `text`; null when nothing parses. */
export function parseLooseJson(text: string): unknown | null {
  const candidate = extractJsonCandidate(text);
  if (candidate == null) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function truncateForLog(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}
