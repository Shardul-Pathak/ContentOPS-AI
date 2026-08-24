import { TrueForge } from "@truefoundry/trueforge-sdk";
const c = new TrueForge({ baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790", timeoutInSeconds: 30 });
const { data } = await c.settings.modelProviders.list();
console.log("providers:", data.length);
for (const p of data) {
  const prov = p as { name?: string; models?: { name?: string }[] };
  for (const m of prov.models ?? []) console.log(`  FQN: ${prov.name}/${m.name}`);
}
