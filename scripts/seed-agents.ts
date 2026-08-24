/**
 * Seeds the local TrueForge server with:
 *  1. The OpenAI-compatible model provider from env
 *     (MODEL_PROVIDER_NAME / MODEL_PROVIDER_BASE_URL / MODEL_PROVIDER_API_KEY)
 *     — optional when the provider is already configured via the TrueForge UI
 *  2. Optional MCP servers (research search, gated CMS endpoint)
 *  3. The six named content agents referencing MODEL_FQN.
 *
 * Idempotent: providers/servers/agents are upserted by name. Credentials are
 * sent once to the TrueForge connector store; they are never written to agent
 * manifests, this repository, or logs.
 *
 * Usage: npm run seed:agents   (requires a running TrueForge server)
 */
import { TrueForge } from "@truefoundry/trueforge-sdk";

// tsx/npm do not auto-load .env — do it explicitly (Node >= 20.6).
// Must run BEFORE config modules are imported: they read env lazily now,
// but keeping this first makes ordering obvious.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on ambient environment */
}


function fail(message: string, hints: string[] = []): never {
  console.error(`\n✗ ${message}`);
  for (const h of hints) console.error(`  • ${h}`);
  process.exit(1);
}

function describeError(err: unknown): { status?: number; detail: string } {
  const e = err as { statusCode?: number; message?: string; body?: unknown };
  const detail =
    e.body != null
      ? JSON.stringify(e.body).slice(0, 400)
      : (e.message ?? String(err));
  return { status: e.statusCode, detail };
}

async function main() {
  // Import AFTER loadEnvFile: config/agents reads env-derived values.
  const { agentDefinitions } = await import("../src/config/agents");

  const baseUrl = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
  console.log(`Seeding TrueForge at ${baseUrl}`);

  const client = new TrueForge({ baseUrl, timeoutInSeconds: 120 });

  // 0. Connectivity preflight — fail with actionable hints, not "fetch failed".
  try {
    await client.agents.list();
  } catch (err) {
    fail(
      `TrueForge is not reachable at ${baseUrl}`,
      [
        "Start it in another terminal:  npx @truefoundry/trueforge@latest",
        "Then open http://localhost:8790 to confirm it is up.",
        "If you run it on a custom port, set TRUEFORGE_BASE_URL in .env.",
      ],
    );
  }
  console.log("✓ server reachable");

  // 1. Model provider ---------------------------------------------------------
  const providerName = process.env.MODEL_PROVIDER_NAME;
  const providerBaseUrl = process.env.MODEL_PROVIDER_BASE_URL;
  const providerApiKey = process.env.MODEL_PROVIDER_API_KEY;
  // Upstream model identifier exactly as the endpoint expects it
  // (e.g. OpenRouter slugs contain a slash: "nvidia/nemotron-3-super-120b-a12b:free").
  const upstreamModel = process.env.MODEL_UPSTREAM_MODEL;
  // Registry name for the model inside TrueForge (single segment, sanitized).
  function registryModelName(upstream: string): string {
    const lastSegment = upstream.split("/").pop() ?? upstream;
    return lastSegment.replace(/[^a-zA-Z0-9._-]/g, "-");
  }
  const derivedFqn =
    upstreamModel && providerName
      ? `${providerName}/${registryModelName(upstreamModel)}`
      : undefined;
  // When the provider + upstream pair is configured here, the derived FQN is
  // authoritative — a hand-written MODEL_FQN with different hyphenation than
  // the registered model name would 422 on agents.create.
  if (
    derivedFqn &&
    process.env.MODEL_FQN &&
    process.env.MODEL_FQN !== derivedFqn
  ) {
    console.warn(
      `• ignoring MODEL_FQN="${process.env.MODEL_FQN}" — using "${derivedFqn}" derived from MODEL_PROVIDER_NAME + MODEL_UPSTREAM_MODEL. Remove the MODEL_FQN line to silence this.`,
    );
  }
  const modelFqn = derivedFqn ?? process.env.MODEL_FQN;
  // Publish the authoritative FQN for downstream modules (config/agents).
  if (modelFqn) process.env.MODEL_FQN = modelFqn;

  if (!modelFqn) {
    fail(
      "MODEL_FQN is not set — agents cannot be created without a known model.",
      [
        "Option A (configure here): set MODEL_PROVIDER_NAME, MODEL_PROVIDER_BASE_URL, MODEL_PROVIDER_API_KEY and MODEL_UPSTREAM_MODEL (the exact upstream id, e.g. nvidia/nemotron-3-super-120b-a12b:free) in .env, then re-run.",
        "Option B (already configured): open TrueForge → Settings → Models, note an available model FQN (e.g. anthropic/claude-sonnet-4-6) and set MODEL_FQN to it.",
      ],
    );
  }

  if (providerName && providerBaseUrl && providerApiKey) {
    if (!upstreamModel) {
      fail(
        "MODEL_PROVIDER_* is set but MODEL_UPSTREAM_MODEL is missing.",
        [
          "MODEL_UPSTREAM_MODEL must be the exact upstream id your endpoint expects (for OpenRouter this includes the vendor prefix, e.g. nvidia/nemotron-3-super-120b-a12b:free).",
        ],
      );
    }
    try {
      await client.settings.modelProviders.createOrUpdate({
        manifest: {
          type: "custom",
          name: providerName,
          baseUrl: providerBaseUrl,
          auth: { apiKey: providerApiKey },
          models: [
            {
              name: registryModelName(upstreamModel),
              modelId: upstreamModel,
              // Without an explicit cap some OpenRouter-compatible endpoints
              // receive an absurd sentinel max_tokens (1e12) and 400.
              properties: { maxOutputTokens: Number(process.env.MODEL_MAX_OUTPUT_TOKENS ?? 8192) },
            },
          ],
        },
      });
      console.log(
        `✓ model provider "${providerName}" upserted (upstream: ${upstreamModel} → registry FQN: ${modelFqn})`,
      );
    } catch (err) {
      const { status, detail } = describeError(err);
      fail(`model provider upsert failed (${status ?? "network"})`, [detail]);
    }
  } else {
    console.log(
      `• MODEL_PROVIDER_* incomplete — assuming "${modelFqn}" already exists (configured via the TrueForge UI).`,
    );
  }

  // 2. MCP servers ------------------------------------------------------------
  const researchMcpName = process.env.RESEARCH_MCP_SERVER_NAME;
  const researchMcpUrl = process.env.RESEARCH_MCP_SERVER_URL;
  if (researchMcpName && researchMcpUrl) {
    try {
      await client.settings.mcpServers.createOrUpdate({
        manifest: {
          type: "remote",
          name: researchMcpName,
          url: researchMcpUrl,
          description: "Web search / source retrieval for the research agent",
          auth: {
            type: "header",
            headers: { Authorization: `Bearer ${process.env.RESEARCH_MCP_HEADER_TOKEN ?? ""}` },
          },
        },
      });
      console.log(`✓ research MCP server "${researchMcpName}" upserted`);
    } catch (err) {
      const { status, detail } = describeError(err);
      fail(`research MCP upsert failed (${status ?? "network"})`, [detail]);
    }
  } else if (researchMcpName) {
    console.log(`• using catalog MCP server "${researchMcpName}" — ensure it is connected in Settings → Connectors`);
  }

  const cmsMcpName = process.env.CMS_MCP_SERVER_NAME;
  const cmsMcpUrl = process.env.CMS_MCP_URL;
  if (cmsMcpName && cmsMcpUrl) {
    try {
      await client.settings.mcpServers.createOrUpdate({
        manifest: {
          type: "remote",
          name: cmsMcpName,
          url: cmsMcpUrl,
          description: "Company blog CMS — publish_article is approval-gated",
          auth: {
            type: "header",
            headers: { Authorization: `Bearer ${process.env.CMS_MCP_HEADER_TOKEN ?? ""}` },
          },
        },
      });
      console.log(`✓ CMS MCP server "${cmsMcpName}" upserted (${cmsMcpUrl})`);
    } catch (err) {
      const { status, detail } = describeError(err);
      fail(`CMS MCP upsert failed (${status ?? "network"})`, [detail]);
    }
  }

  // 3. Named agents -----------------------------------------------------------
  for (const def of agentDefinitions()) {
    try {
      await client.agents.create({ name: def.name, manifest: def.manifest });
      console.log(`✓ created agent ${def.name}`);
    } catch (createErr) {
      const { status, detail } = describeError(createErr);
      if (status !== 409) {
        fail(`creating agent ${def.name} failed (${status ?? "network"})`, [
          detail,
          'If the error says "Unknown model", set MODEL_FQN to a model that exists under Settings → Models.',
        ]);
      }
      try {
        const { data } = await client.agents.list();
        const existing = data.find((a) => a.name === def.name);
        if (!existing) throw new Error("not found after 409");
        await client.agents.update(existing.id, { manifest: def.manifest });
        console.log(`✓ updated agent ${def.name}`);
      } catch (updateErr) {
        const u = describeError(updateErr);
        fail(`updating agent ${def.name} failed (${u.status ?? "network"})`, [u.detail]);
      }
    }
  }

  console.log("\nSeed complete.");
}

main().catch((err: unknown) => {
  const e = err as { message?: string; cause?: { code?: string } };
  fail(e.message ?? String(err), e.cause?.code ? [`network cause: ${e.cause.code}`] : []);
});
