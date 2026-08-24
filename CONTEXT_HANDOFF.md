# Context Handoff

## Project
Autonomous Content Operations Platform (TrueForge-first)

## Current Branch
main

## Current Task
F0–F9 COMPLETE and merged (60/60 tests green). Next: F10 publishing-approval → F11 cms-publishing → F12 end-to-end-workflow. These are the SAFETY-CRITICAL milestones; give them a full context window.

## Completed Work (merge commits)
- F0 bootstrap: `a1e041e` docs+agents · `7e8d76e` scaffold
- F1 company-context `c8c16c4` · F2 campaign-management `bf50826` · docs `db391dc`
- F3 trueforge-foundation `d6b7925` · F4 research-agent `8f0a1c5-ish` (feea112) · F5 growth-agent · F6 writer-agent · F7 quality-agent · F8 revision-workflow `78ca33b` · F9 image-generation (+ fix 9051b11)
- Verification before every merge: lint + typecheck + vitest + next build all green (currently 13 files / 60 tests)

## What Exists Now (architecture snapshot)
- Stack: Next.js 15.5 App Router + Prisma 6/SQLite + Zod + Vitest + Tailwind 4; TrueForge SDK `@truefoundry/trueforge-sdk@0.1.3`
- Domain types of SDK live under `TrueForgeApi.*` namespace; wire fields camelCase in TS (`requiredActions`, not `required_actions`)
- `src/domain/state-machine.ts`: §20 states, MAX_REVISIONS=3, REVIEW_FAIL→REVISING/<limit else REQUIRES_HUMAN_INTERVENTION
- `src/config/agents.ts`: 6 named agents; response_format json_schema via zod-to-json-schema (`RESPONSE_FORMAT_MODE`); research MCP env-driven (`RESEARCH_MCP_SERVER_NAME[_URL]`, type "remote", header auth Record<string,string>); writer sandbox+skills ONLY when ENABLE_SANDBOX=true && WRITER_SKILLS set (Daytona optional per owner decision)
- `src/lib/agent-runtime.ts`: AgentRuntime port = TrueForgeRuntime (streaming, delta merge, approval collection from turn.done.state.requiredActions → PendingApproval{toolCallId,threadId,sourceEventId,toolName,argsPreview}, metrics cost) + MockAgentRuntime (fixtures, overrideOutputText/failCallIndexes scripting, recordedPrompts[] for prompt assertions)
- `src/services/workflow/orchestrator.ts`: startWorkflow→202/background runWorkflow; VALIDATING gate (audience required); stages persist artifacts; ResearchSource rows; Asset rows (assets JSON blob REMOVED — API maps assetRows→`assets` array); revision loop caps count at MAX_REVISIONS (writer runs = 1+N when escalating at 3rd FAIL... precisely: FAILs 1..3 → REVISING rewrites, 4th consecutive FAIL escalates with revisionCount=3); stops at AWAITING_APPROVAL
- APIs: `/api/companies*`, `/api/campaigns*`, POST/GET `/api/campaigns/[id]/contents`, GET `/api/contents/[id]`; UI pages /companies, /campaigns, /campaigns/[id] (start workflow), /content/[id] (polling timeline)
- DB models: Company, Campaign, Content(status/currentAgent/revisionCount/failureReason/research/strategy/draft/qualityReview), ResearchSource, AgentRun(tfSessionId/tfTurnId/lastSequenceNumber/activity/output/metrics), Asset
- `scripts/seed-agents.ts` (npm run seed:agents): upserts provider + MCP + agents idempotently

## Architecture Decisions
- App owns states/validation/sequencing; TrueForge owns execution/tools/HITL/resume
- One TF session per agent stage; structured validated handoffs only
- Approval is harness-gated tool pause + app-side Approval record; deny ⇒ CANCELLED; new action needs fresh approval
- Sandbox/skills strictly optional (owner decision); never block core path
- Branching per §28: feat|fix/* branches, --no-ff merges, delete after merge

## Known Issues
- ESLint via FlatCompat bridge; npm 12 needs install-scripts approve (@prisma/engines esbuild sharp)
- Live TrueForge server never run in this env yet — everything verified against SDK types + mock runtime. FIRST TASK of F10 session: `npx @truefoundry/trueforge@latest` smoke + seed script against real server if a model key is available
- MCP catalog contents (image-gen? Exa?) still unverified against a live server

## Exact Next Steps (F10 feature/publishing-approval)
1. Prisma: Approval model {id,contentId,status(pending/approved/rejected),destination,payloadSummary Json,tfsessionId,tfTurnId,toolCallId,threadId,decidedAt} + migration.
2. Orchestrator: after image stage, do NOT just stop — publisher "prepare" step: build payload preview (title/slug/meta/assets/destination) → create Approval row (pending) → content AWAITING_APPROVAL.
3. API: GET pending approval embedded in /api/contents/[id]; POST /api/contents/[id]/approval {decision:"approve"|"reject"}:
   - approve → verify Approval row pending + content AWAITING_APPROVAL → send user.tool_approval {allow} to the paused TF turn (F10 can simulate execution with mock publisher fixture; real gated call lands F11) → PUBLISHING→PUBLISHED path; store published URL on PublishingJob or Content
   - reject → user.tool_approval {deny} → CANCELLED; ensure no execution; double-submit idempotent (409 or no-op)
4. UI: ApprovalPanel on /content/[id]: destination, payload summary, Allow/Deny buttons wired to API.
5. Tests (mock runtime): approve-resumes-publishes-once; reject-cancels; stale approval cannot authorize different payload; double-submit protected; publish failure → FAILED.
Then F11 feature/cms-publishing: in-repo MCP endpoint /api/mcp/cms (tools: prepare_draft, upload_asset, publish_article [gated via require_approval_for_tools in publisher agent spec], get_publication_status) + publisher agent wiring + idempotency key + verification. Then F12 e2e polish + README demo script.
