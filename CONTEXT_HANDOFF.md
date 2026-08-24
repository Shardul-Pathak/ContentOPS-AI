# Context Handoff

## Project
Autonomous Content Operations Platform (TrueForge-first)

## Current Branch
main

## Current Task
F3 trueforge-foundation COMPLETE and merged (`d6b7925`). Next: F4 research-agent.

## Completed Work (commit hashes)
- F0 bootstrap: `a1e041e` docs+agents · `7e8d76e` scaffold (Next.js 15.5, Prisma 6, Vitest 3, Tailwind 4, Zod 3; npm 12 → `npm install-scripts approve @prisma/engines esbuild sharp` after install)
- F1 company-context: merge `c8c16c4`
- F2 campaign-management: merge `bf50826`
- F3 trueforge-foundation: merge `d6b7925` — 35/35 tests green, lint/typecheck/build clean

## F3 Architecture (what exists now)
- `src/domain/state-machine.ts` — §20 states as pure fns; MAX_REVISIONS=3; REVIEW_FAIL→REVISING (<limit) / REQUIRES_HUMAN_INTERVENTION (at limit)
- `src/contracts/artifacts.ts` — zod schemas §10–15 + jsonSchemaFor() (zod-to-json-schema) for TF response_format
- `src/config/agents.ts` — 6 named agents (content-research/growth/writer/quality/image/publisher-agent); instructions ported from .opencode prompts; response_format json_schema unless RESPONSE_FORMAT_MODE != json_schema; research gets `@read-only` MCP via RESEARCH_MCP_SERVER_NAME env; dynamic subagents ON only for research
- `src/lib/agent-runtime.ts` — AgentRuntime port: TrueForgeRuntime (SDK 0.1.3 verified shapes: sessions.create/createTurnStream/.withMetadata() ids, isEventDelta/mergeEventDelta, requiredActions camelCase, metrics) + MockAgentRuntime (fixtures per role, overrideOutputText/failCallIndexes scripting)
- `src/services/workflow/orchestrator.ts` — startWorkflow (202 + background runWorkflow) → VALIDATING gate (audience required) → research→growth→[writer→quality]×(1+revisions)→image→AWAITING_APPROVAL stop; one corrective retry on unparseable output; failure persisted, never fabricated; revisionCount capped at MAX_REVISIONS
- APIs: POST+GET `/api/campaigns/[id]/contents`, GET `/api/contents/[id]`; UI `/content/[id]` polling timeline + artifacts
- `scripts/seed-agents.ts` (npm run seed:agents): upserts custom OpenAI-compatible model provider from env + 6 agents (idempotent)
- SDK type note: domain types live under `TrueForgeApi.*` namespace (AgentSpec, McpServer, ResponseFormat, RuntimeConfig)

## Architecture Decisions
- App owns business states/validation/sequencing; TrueForge owns execution/tools/HITL/resume
- One fresh TF session per agent stage = isolated structured handoffs (§4.5)
- Structured sections stored as Json columns; Zod at boundaries; scalar fields nullish-tolerant for row revalidation
- Approval stop at AWAITING_APPROVAL; publishing arrives in F10/F11
- Branching per AGENTS.md §28: feat/* merged --no-ff, branch deleted after

## Important Files
docs/IMPLEMENTATION_PLAN.md · .env.example (full env contract incl. MODEL_PROVIDER_*, ENABLE_SANDBOX) · src/lib/db.ts · tests/setup.ts (per-file SQLite isolation pattern) · README.md

## Known Issues
- ESLint needs FlatCompat bridge (eslint-config-next legacy format on ESLint 9)
- TrueForge server itself not installed here — AGENT_PROVIDER=mock default; live-server smoke pending (needs `npx @truefoundry/trueforge@latest` + model key)

## Next Action
Branch feat/research-agent from main tip. Scope: add ResearchSource table (persist sources[] with url/publisher/relevance/claimsSupported per Content), wire RESEARCH_MCP_SERVER_NAME into seed-agents.ts mcpServers.createOrUpdate when env set, tests for source persistence. Then F5 growth-agent (mostly exists — verify contract tests), F6 writer (+ENABLE_SANDBOX/WRITER_SKILLS conditional in agents.ts), F7 quality (history preserved via agentRuns — add explicit test).
