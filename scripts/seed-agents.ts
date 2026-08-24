/**
 * Seeds the local TrueForge server with:
 *  1. The OpenAI-compatible model provider from env
 *     (MODEL_PROVIDER_NAME / MODEL_PROVIDER_BASE_URL / MODEL_PROVIDER_API_KEY)
 *  2. The six named content agents referencing MODEL_FQN.
 *
 * Idempotent: providers and agents are upserted by name. Credentials are sent
 * once to the TrueForge connector store; they are never written to agent
 * manifests, this repository, or logs.
 *
 * Usage: npm run seed:agents   (requires a running TrueForge server)
 */
import { TrueForge } from "@truefoundry/trueforge-sdk";
import { agentDefinitions } from "../src/config/agents";

async function main() {
  const baseUrl = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
  console.log(`Seeding TrueForge at ${baseUrl}`);

  const client = new TrueForge({ baseUrl, timeoutInSeconds: 120 });

  // 1. Model provider ---------------------------------------------------------
  const providerName = process.env.MODEL_PROVIDER_NAME;
  const providerBaseUrl = process.env.MODEL_PROVIDER_BASE_URL;
  const providerApiKey = process.env.MODEL_PROVIDER_API_KEY;
  const modelFqn = process.env.MODEL_FQN;

  if (!providerName || !providerBaseUrl || !providerApiKey || !modelFqn) {
    console.warn(
      "[seed] MODEL_PROVIDER_* / MODEL_FQN not fully configured — skipping model provider setup.\n" +
        "       Configure a provider in the TrueForge UI (Settings → Models) or fill .env.",
    );
  } else {
    const [providerId, modelId] = modelFqn.split("/");
    await client.settings.modelProviders.createOrUpdate({
      manifest: {
        type: "custom",
        name: providerId,
        baseUrl: providerBaseUrl,
        auth: { apiKey: providerApiKey },
        models: [{ name: modelId ?? "default", modelId: modelId ?? "default", properties: {} }],
      },
    });
    console.log(`✓ model provider "${providerId}" upserted (${modelFqn})`);
  }

  // 2. Research MCP server (optional; catalog servers like Exa connect via UI)
  const researchMcpName = process.env.RESEARCH_MCP_SERVER_NAME;
  const researchMcpUrl = process.env.RESEARCH_MCP_SERVER_URL;
  if (researchMcpName && researchMcpUrl) {
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
  } else if (researchMcpName) {
    console.log(`• using catalog MCP server "${researchMcpName}" — ensure it is connected in Settings → Connectors`);
  }

  // 2b. CMS MCP server (the gated publishing destination)
  const cmsMcpName = process.env.CMS_MCP_SERVER_NAME;
  const cmsMcpUrl = process.env.CMS_MCP_URL;
  if (cmsMcpName && cmsMcpUrl) {
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
  }

  // 3. Named agents -----------------------------------------------------------
  for (const def of agentDefinitions()) {
    try {
      await client.agents.create({ name: def.name, manifest: def.manifest });
      console.log(`✓ created agent ${def.name}`);
    } catch {
      // Name already taken → update in place (names are immutable).
      const { data } = await client.agents.list();
      const existing = data.find((a) => a.name === def.name);
      if (!existing) throw new Error(`could not create or find agent ${def.name}`);
      await client.agents.update(existing.id, { manifest: def.manifest });
      console.log(`✓ updated agent ${def.name}`);
    }
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
