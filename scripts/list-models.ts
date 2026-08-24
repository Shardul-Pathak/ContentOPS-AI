/**
 * Lists every configured model as its TrueForge FQN (<provider>/<model>).
 * Any of these is a valid MODEL_FQN for seed:agents (Option B).
 *
 * Usage: npm run list:models   (requires a running TrueForge server)
 */
import { TrueForge } from "@truefoundry/trueforge-sdk";

// tsx/npm do not auto-load .env — load explicitly without overriding real env.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

async function main() {
  const baseUrl = process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790";
  const client = new TrueForge({ baseUrl, timeoutInSeconds: 60 });

  try {
    await client.agents.list();
  } catch {
    console.error(`✗ TrueForge not reachable at ${baseUrl}`);
    console.error("  Start it first:  npx @truefoundry/trueforge@latest");
    process.exit(1);
  }

  const { data } = await client.settings.modelProviders.list();
  if (data.length === 0) {
    console.log("No model providers configured.");
    console.log("Either configure one in the TrueForge UI (Settings → Models)");
    console.log("or set MODEL_PROVIDER_NAME / MODEL_PROVIDER_BASE_URL /");
    console.log("MODEL_PROVIDER_API_KEY / MODEL_UPSTREAM_MODEL in .env and run:");
    console.log("  npm run seed:agents");
    return;
  }

  console.log("Valid MODEL_FQN values:\n");
  for (const p of data) {
    const prov = p as { name?: string; models?: { name?: string }[] };
    for (const m of prov.models ?? []) {
      console.log(`  ${prov.name}/${m.name}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
