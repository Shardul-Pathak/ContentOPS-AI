# Context Handoff

## Project
Autonomous Content Operations Platform (TrueForge-first)

## Current Branch
main

## Current Task
F1 company context management COMPLETE. Next: F2 campaign management (feature/campaign-management).

## Completed Work
- F0 bootstrap: `a1e041e` docs+agents, `7e8d76e` scaffold (Next.js 15.5 + Prisma 6 + Vitest 3 + Tailwind 4 + Zod 3; npm 12 requires `npm install-scripts approve` for @prisma/engines esbuild sharp)
- F1: merge `c8c16c4` — Company model+migration `20260824155524_init_company`, zod contract `src/contracts/company-context.ts`, service `src/services/companies.ts` (ValidationError/NotFoundError), API `/api/companies`(GET/POST)+`/[id]`(GET/PATCH), UI `/companies`, tests (12 passing) with per-file SQLite isolation via `tests/setup.ts`
- Verified each feature before commit: lint+typecheck+test+build all green

## Architecture Decisions
- TrueForge = agent harness (see docs/IMPLEMENTATION_PLAN.md for verified API facts)
- App-side workflow sequencing of six named TF agents; one session per agent run
- Structured sections stored as Json columns (SQLite has no scalar lists); validated by Zod at service boundary
- Audience emptiness allowed at storage time — enforce presence at workflow VALIDATING stage later
- Branching per AGENTS.md §28: feat/* branches merged --no-ff, deleted after merge

## Important Files
- docs/IMPLEMENTATION_PLAN.md — full finalized plan incl. verified TrueForge facts
- .env.example — env contract (MODEL_PROVIDER_*, TRUEFORGE_BASE_URL, AGENT_PROVIDER=mock|trueforge)
- src/lib/db.ts (prisma singleton), tests/setup.ts (test DB pattern)

## Known Issues
- ESLint via FlatCompat bridge (eslint-config-next is legacy-format on ESLint 9)

## Next Action
Create branch feat/campaign-management from main tip: Campaign model (name, description, goal, targetAudience, topics Json[], status enum, companyId FK) + migration, services/campaigns.ts, /api/companies/[id]/campaigns POST+GET, /api/campaigns/[id] GET/PATCH with status transition guard, /campaigns UI pages, tests following F1 patterns.

## Remaining Work (branch order)
F2 campaign-management → F3 trueforge-foundation → F4 research-agent → F5 growth-agent → F6 writer-agent → F7 quality-agent → F8 revision-workflow → F9 image-generation → F10 publishing-approval → F11 cms-publishing → F12 end-to-end-workflow

## Reference
- AGENTS.md — product rules and policies
- docs/IMPLEMENTATION_PLAN.md — finalized architecture + verified TrueForge API facts
- .opencode/agents/*.md — legacy prompt sources; superseded by TrueForge named agents in F3

